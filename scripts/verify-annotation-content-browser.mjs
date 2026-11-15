import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

assert.equal(process.env.ANNOTATION_PRODUCTION_TEST, '1', 'Explicit production test authorization required');
process.loadEnvFile('.env.local');
const base = process.env.ANNOTATION_TEST_BASE_URL || 'http://localhost:3249';
const output = process.env.ANNOTATION_TEST_OUTPUT || '/tmp/annotation-browser';
await mkdir(output, { recursive: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
function check(result) { if (result.error) throw new Error(result.error.message); return result.data; }
const contentId = randomUUID(), segmentId = randomUUID();
const password = `Synthetic-${randomUUID()}-Aa1!`, email = `annotation-browser-${randomUUID()}@example.invalid`;
const title = `Synthetic annotation browser ${contentId}`;
const note = 'Synthetic reflection preserved on the original edition.';
let userId, browser;
const failures = [];
try {
  const auth = check(await db.auth.admin.createUser({ email, password, email_confirm: true })); userId = auth.user.id;
  check(await db.from('profiles').update({ role: 'admin', is_internal: true, onboarding_state: { completed: true } }).eq('id', userId));
  const covers = check(await db.from('content_item').select('cover_image_url').eq('status', 'verified').not('cover_image_url', 'is', null).limit(1));
  check(await db.from('content_item').insert({ id: contentId, title, type: 'article', status: 'verified', category: 'Business', cover_image_url: covers[0].cover_image_url,
    quick_mode_json: { hook: 'Synthetic hook', big_idea: 'Original browser idea', key_takeaways: ['Synthetic takeaway'] } }));
  check(await db.from('segment').insert({ id: segmentId, item_id: contentId, order_index: 0, title: 'Synthetic section', markdown_body: 'A short synthetic passage for checking annotations and revision saves.' }));
  const [initial] = check(await db.from('content_item').select('published_at,reading_revision').eq('id', contentId));
  browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await desktop.newPage();
  page.on('pageerror', error => failures.push(error.message));
  await page.goto(`${base}/admin-login`);
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/admin\/?$/, { timeout: 30_000 });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await desktop.storageState() });
  const reader = await mobile.newPage();
  reader.on('pageerror', error => failures.push(error.message));
  await reader.goto(`${base}/read/${contentId}`);
  await reader.getByRole('button', { name: `Save ${title} to Library`, exact: true }).click();
  const sectionButton = reader.locator(`[data-reader-segment-id="${segmentId}"] > button`);
  if (await sectionButton.getAttribute('aria-expanded') === 'false') await sectionButton.click();
  await reader.getByRole('button', { name: 'Finish Reading', exact: true }).waitFor({ timeout: 20_000 });
  await page.goto(`${base}/admin/content/${contentId}/edit`);
  await page.getByText('This summary has no highlights or notes.', { exact: false }).waitFor();
  await page.getByLabel('Big Idea', { exact: true }).fill('Direct browser revision');
  const save = page.waitForResponse(response => response.url().includes(`/api/admin/content/${contentId}`) && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save as Draft', exact: true }).click();
  const direct = await save; assert.equal(direct.status(), 200); assert.equal((await direct.json()).data.id, contentId);
  let [original] = check(await db.from('content_item').select('id,status,published_at,reading_revision,quick_mode_json').eq('id', contentId));
  assert.equal(original.status, 'draft'); assert.equal(original.published_at, initial.published_at);
  assert.equal(original.quick_mode_json.big_idea, 'Direct browser revision');
  assert.notEqual(original.reading_revision, initial.reading_revision);
  console.log('PASS: desktop editor updates the same record and honors Save as Draft');
  // Restore visibility without invoking narration or image-generation jobs.
  check(await db.from('content_item').update({ status: 'verified' }).eq('id', contentId));
  await reader.getByRole('button', { name: 'Finish Reading', exact: true }).click();
  await reader.getByRole('button', { name: /Capture a reflection|Write a reflection/ }).click();
  await reader.getByPlaceholder('A few sentences is enough.').fill(note);
  const rejected = reader.waitForResponse(response => response.url().endsWith('/api/library/reflections') && response.request().method() === 'POST');
  await reader.getByRole('button', { name: 'Save reflection', exact: true }).click();
  assert.equal((await rejected).status(), 409);
  assert.equal(await reader.getByPlaceholder('A few sentences is enough.').inputValue(), note);
  console.log('PASS: stale mobile reflection is rejected and the entered text remains available');
  await reader.reload();
  await reader.getByRole('button', { name: /Capture a reflection|Write a reflection/ }).click();
  await reader.getByPlaceholder('A few sentences is enough.').fill(note);
  const accepted = reader.waitForResponse(response => response.url().endsWith('/api/library/reflections') && response.request().method() === 'POST');
  await reader.getByRole('button', { name: 'Save reflection', exact: true }).click();
  assert.equal((await accepted).status(), 200);
  await reader.screenshot({ path: `${output}/mobile-reader.png`, fullPage: true });
  const reflections = check(await db.from('user_reflections').select('id,reflection_text,content_revision').eq('content_item_id', contentId));
  assert.equal(reflections.length, 1); assert.equal(reflections[0].reflection_text, note);
  assert.equal(reflections[0].content_revision, original.reading_revision);
  await page.goto(`${base}/admin/content/${contentId}/edit`);
  await page.getByRole('button', { name: 'Create updated version', exact: true }).waitFor();
  await page.getByLabel('Big Idea', { exact: true }).fill('Protected browser revision');
  const linkedSave = page.waitForResponse(response => response.url().includes(`/api/admin/content/${contentId}`) && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save as Draft', exact: true }).click();
  const linkedResponse = await linkedSave; assert.equal(linkedResponse.status(), 200);
  const receipt = (await linkedResponse.json()).data;
  assert.equal(receipt.version_draft, true); assert.notEqual(receipt.id, contentId);
  await page.waitForURL(`**/admin/content/${receipt.id}/edit`);
  await page.screenshot({ path: `${output}/desktop-linked-draft.png`, fullPage: true });
  [original] = check(await db.from('content_item').select('status,published_at,quick_mode_json').eq('id', contentId));
  assert.equal(original.status, 'verified'); assert.equal(original.published_at, initial.published_at);
  assert.equal(original.quick_mode_json.big_idea, 'Direct browser revision');
  const [draft] = check(await db.from('content_item').select('status,update_source_id,quick_mode_json').eq('id', receipt.id));
  assert.equal(draft.status, 'draft'); assert.equal(draft.update_source_id, contentId);
  assert.equal(draft.quick_mode_json.big_idea, 'Protected browser revision');
  assert.equal(check(await db.from('user_reflections').select('id').eq('id', reflections[0].id)).length, 1);
  assert.deepEqual(failures, []);
  console.log('PASS: protected editor save redirects to the linked draft and preserves the original reflection, text and publication history');
  await writeFile(`${output}/results.json`, JSON.stringify({ passed: true, desktop: true, mobile: true, pageErrors: failures, checkedAt: new Date().toISOString() }, null, 2));
} catch (error) {
  if (browser) {
    for (const [index, context] of browser.contexts().entries()) {
      const page = context.pages().at(-1);
      if (page) {
        await page.screenshot({ path: `${output}/failure-${index}.png`, fullPage: true }).catch(() => {});
        await writeFile(`${output}/failure-${index}.txt`, await page.locator('body').innerText()).catch(() => {});
      }
    }
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (userId) check(await db.auth.admin.deleteUser(userId));
  check(await db.from('content_item').delete().eq('update_source_id', contentId));
  check(await db.from('content_item').delete().eq('id', contentId));
  console.log('PASS: synthetic browser account and content removed');
}
