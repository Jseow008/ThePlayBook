import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { classifyEvent, classifyPaths } from '../../scripts/classify-ci-changes.mjs';

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

function repository() {
  const directory = mkdtempSync(join(tmpdir(), 'netflux-ci-scope-'));
  directories.push(directory);
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'CI fixture');
  git('config', 'user.email', 'ci@example.invalid');
  const write = (path, text) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  };
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  write('docs/guide.md', 'documentation');
  write('app/page.tsx', 'runtime');
  write('supabase/migrations/001.sql', 'migration');
  return { directory, git, write, commit, base: commit() };
}

it('allows only explicit documentation paths', () => {
  expect(classifyPaths(['docs/guide.md', 'docs/nested/guide.md', 'README.md', 'LICENSE']).runFull).toBe(false);
});

it.each([
  [], ['docs/guide.md', 'app/page.tsx'], ['docs/runner.mjs'], ['docs/page.mdx'], ['unknown.md'],
  ['AGENTS.md'], ['package-lock.json'], ['.github/workflows/ci.yml'], ['lib/supabase/server.ts'],
].map((paths) => ({ paths })))('runs full verification for unknown, executable, mixed, or empty changes: %j', ({ paths }) => {
  expect(classifyPaths(paths).runFull).toBe(true);
});

it('uses the PR merge base and permits a real docs-only change', () => {
  const repo = repository();
  repo.write('docs/guide.md', 'updated documentation');
  const head = repo.commit();
  expect(classifyEvent('pull_request', { pull_request: { base: { sha: repo.base }, head: { sha: head } } }, repo.directory).runFull).toBe(false);
});

it('classifies both paths of a rename so moving code into docs cannot bypass verification', () => {
  const repo = repository();
  renameSync(join(repo.directory, 'app/page.tsx'), join(repo.directory, 'docs/page.md'));
  const head = repo.commit();
  expect(classifyEvent('push', { before: repo.base, after: head }, repo.directory).runFull).toBe(true);
});

it('runs full verification for a deleted migration', () => {
  const repo = repository();
  rmSync(join(repo.directory, 'supabase/migrations/001.sql'));
  const head = repo.commit();
  expect(classifyEvent('push', { before: repo.base, after: head }, repo.directory).runFull).toBe(true);
});

it('defaults to full verification for missing history and manual events', () => {
  const repo = repository();
  expect(classifyEvent('push', { before: 'a'.repeat(40), after: repo.base }, repo.directory).runFull).toBe(true);
  expect(classifyEvent('push', { before: '0'.repeat(40), after: repo.base }, repo.directory).runFull).toBe(true);
  expect(classifyEvent('pull_request', {}, repo.directory).runFull).toBe(true);
  expect(classifyEvent('workflow_dispatch', {}, repo.directory).runFull).toBe(true);
});

it('writes a fail-closed output when CLI event data is unreadable', () => {
  const repo = repository();
  const output = join(repo.directory, 'output');
  execFileSync(process.execPath, [join(process.cwd(), 'scripts/classify-ci-changes.mjs')], {
    cwd: repo.directory,
    env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: join(repo.directory, 'missing-event'), GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: join(repo.directory, 'summary') },
  });
  expect(readFileSync(output, 'utf8')).toBe('run_full=true\n');
});

it('writes the docs-only output and an explicit summary for a real push', () => {
  const repo = repository();
  repo.write('docs/guide.md', 'changed documentation');
  const head = repo.commit();
  const event = join(repo.directory, 'event.json');
  const output = join(repo.directory, 'output');
  const summary = join(repo.directory, 'summary');
  writeFileSync(event, JSON.stringify({ before: repo.base, after: head }));
  execFileSync(process.execPath, [join(process.cwd(), 'scripts/classify-ci-changes.mjs')], {
    cwd: repo.directory,
    env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
  });
  expect(readFileSync(output, 'utf8')).toBe('run_full=false\n');
  expect(readFileSync(summary, 'utf8')).toContain('not applicable');
});
