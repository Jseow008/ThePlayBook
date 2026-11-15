import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const local = process.env.SUPABASE_LOCAL === '1';
if (!local) {
  const ref = (await readFile(join(root, 'supabase/.temp/project-ref'), 'utf8')).trim();
  if (ref === 'xmuqsgfxuaaophxnwure') assert.equal(process.env.ANNOTATION_PRODUCTION_TEST, '1', 'Explicit production test authorization required');
  else assert.equal(process.env.ANNOTATION_DISPOSABLE, '1', 'Explicit disposable project required');
}
const run = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'annotation-concurrency-'));
let sequence = 0;
async function query(sql) {
  const file = join(directory, `${sequence++}.sql`);
  await writeFile(file, sql, { mode: 0o600 });
  const { stdout } = await run('npx', ['supabase', 'db', 'query', local ? '--local' : '--linked', '--file', file, '--output', 'json'], { cwd: root, timeout: 35_000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout).rows;
}
const [user, source, section, second, secondSection] = Array.from({ length: 5 }, randomUUID);
const marker = 1543151115;
const waiter1 = `annotation-save-${source}`, waiter2 = `annotation-capture-${second}`;
const waitForBlocked = name => `
  FOR attempt IN 1..200 LOOP
    PERFORM pg_stat_clear_snapshot();
    IF EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.application_name='${name}' AND pg_backend_pid()=ANY(pg_blocking_pids(a.pid))) THEN RETURN; END IF;
    PERFORM pg_sleep(0.1);
  END LOOP;
  RAISE EXCEPTION 'Concurrent worker did not block on the source lock';`;
async function barrier(key) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await query(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=${key} AND granted) AS ready;`))[0].ready) return;
  }
  throw new Error('Concurrent writer did not reach the test barrier');
}
const jobs = [];
async function worker(name, sql) {
  const [row] = await query(`SELECT cron.schedule('${name}', '1 seconds', $job$${sql}$job$) AS id;`);
  jobs.push({ id: row.id, name });
  return row.id;
}
async function completed(id) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = await query(`SELECT status,return_message FROM cron.job_run_details WHERE jobid=${id} ORDER BY runid DESC LIMIT 1;`);
    if (result[0]?.status === 'succeeded') return;
    if (result[0]?.status === 'failed') throw new Error(`Independent database worker failed: ${result[0].return_message}`);
  }
  throw new Error('Independent database worker did not finish');
}
try {
  const setup = await query(`BEGIN;
    INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES('${user}','${user}@example.invalid','{}','{}');
    INSERT INTO public.content_item(id,title,type,status,quick_mode_json) VALUES
      ('${source}','Synthetic concurrent annotation ${source}','article','draft','{"hook":"Original","big_idea":"Idea","key_takeaways":["One"]}'),
      ('${second}','Synthetic concurrent revision ${second}','article','draft','{"hook":"Original","big_idea":"Idea","key_takeaways":["One"]}');
    INSERT INTO public.segment(id,item_id,order_index,markdown_body) VALUES('${section}','${source}',0,'Synthetic original'),('${secondSection}','${second}',0,'Synthetic original');
    COMMIT; SELECT id,reading_revision FROM public.content_item WHERE id IN ('${source}','${second}');`);
  const revision = setup.find(row => row.id === source).reading_revision;
  const secondRevision = setup.find(row => row.id === second).reading_revision;
  const annotate = await worker(`annotation-first-${source}`, `SET statement_timeout='25s';
    DO $$ DECLARE attempt integer; BEGIN
      IF EXISTS(SELECT 1 FROM public.user_highlights WHERE user_id='${user}' AND content_item_id='${source}') THEN RETURN; END IF;
      PERFORM set_config('request.jwt.claim.role','service_role',true);
      INSERT INTO public.user_highlights(user_id,content_item_id,segment_id,highlighted_text,content_revision)
        VALUES('${user}','${source}','${section}','Synthetic original','${revision}');
      PERFORM pg_advisory_xact_lock(${marker}::bigint);
      ${waitForBlocked(waiter1)}
    END $$;`);
  await barrier(marker);
  const save = await query(`SET application_name='${waiter1}'; SET statement_timeout='25s';
    SELECT set_config('request.jwt.claim.role','service_role',false);
    SELECT public.admin_save_content_revision('${source}','{"quick_mode_json":{"hook":"Rewritten","big_idea":"Idea","key_takeaways":["One"]}}',NULL,NULL) AS receipt;`);
  await completed(annotate);
  await query(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobid=${annotate};`);
  assert.equal(save[0].receipt.created_version, true);
  assert.notEqual(save[0].receipt.content_id, source);
  console.log('PASS: annotation commits first; waiting save creates a linked draft');

  const rewrite = await worker(`revision-first-${second}`, `SET statement_timeout='25s';
    DO $$ DECLARE attempt integer; BEGIN
      IF (SELECT quick_mode_json->>'hook' FROM public.content_item WHERE id='${second}')='Changed before note' THEN RETURN; END IF;
      PERFORM set_config('request.jwt.claim.role','service_role',true);
      PERFORM public.admin_update_content_graph('${second}','{"quick_mode_json":{"hook":"Changed before note","big_idea":"Idea","key_takeaways":["One"]}}',NULL,NULL);
      PERFORM pg_advisory_xact_lock(${marker + 1}::bigint);
      ${waitForBlocked(waiter2)}
    END $$;`);
  await barrier(marker + 1);
  const capture = await query(`SET application_name='${waiter2}'; SET statement_timeout='25s';
    DO $$ BEGIN
      BEGIN INSERT INTO public.user_highlights(user_id,content_item_id,segment_id,highlighted_text,content_revision)
        VALUES('${user}','${second}','${secondSection}','Synthetic original','${secondRevision}');
        RAISE EXCEPTION 'Stale concurrent highlight accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
      BEGIN INSERT INTO public.user_reflections(user_id,content_item_id,prompt,reflection_text,content_revision)
        VALUES('${user}','${second}','Prompt','Stale concurrent reflection','${secondRevision}');
        RAISE EXCEPTION 'Stale concurrent reflection accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
    END $$; SELECT 'Stale highlight and reflection rejected' AS result;`);
  assert.equal(capture[0].result, "Stale highlight and reflection rejected");
  await completed(rewrite);
  await query(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobid=${rewrite};`);
  const [state] = await query(`SELECT (SELECT quick_mode_json->>'hook' FROM public.content_item WHERE id='${source}')='Original' AS original_preserved,
    NOT EXISTS(SELECT 1 FROM public.user_highlights WHERE content_item_id='${second}') AND NOT EXISTS(SELECT 1 FROM public.user_reflections WHERE content_item_id='${second}') AS stale_annotations_absent;`);
  assert.equal(state.original_preserved, true); assert.equal(state.stale_annotations_absent, true);
  console.log('PASS: content commits first; waiting stale highlight and reflection are rejected');
} finally {
  for (const job of jobs) {
    await query(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobid=${job.id};`);
    await completed(job.id).catch(() => {});
  }
  await query(`BEGIN; DELETE FROM auth.users WHERE id='${user}';
    DELETE FROM public.content_item WHERE update_source_id IN ('${source}','${second}');
    DELETE FROM public.content_item WHERE id IN ('${source}','${second}'); COMMIT;
    SELECT count(*)::int AS remaining FROM public.content_item WHERE id IN ('${source}','${second}') OR update_source_id IN ('${source}','${second}');`).then(rows => assert.equal(rows[0].remaining, 0));
  if (jobs.length) await query(`DELETE FROM cron.job_run_details WHERE jobid IN (${jobs.map(job => job.id).join(',')}); SELECT 'test job history removed' AS result;`);
  await rm(directory, { recursive: true, force: true });
  console.log('PASS: synthetic records and temporary queries removed');
}
