import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const full = (reason) => ({ runFull: true, runDatabase: true, runResponsive: true, reason });

const isDocumentation = (path) => ['README.md', 'LICENSE', 'AGENTS.md', 'CHANGELOG.md', 'CONTRIBUTING.md'].includes(path)
  || /^docs\/(?:[^/]+\/)*[^/]+\.md$/.test(path)
  || /^\.github\/(?:ISSUE_TEMPLATE\/[^/]+\.(?:md|yml|yaml)|PULL_REQUEST_TEMPLATE(?:\.md|\/[^/]+\.md))$/.test(path);

// Skip lists, not trigger lists: new or ambiguous executable paths retain all gates.
// CSS and passive media cannot alter the database contract. JS/HTML/SVG remain unknown.
const isPresentationAsset = (path) => /^(?:app|components|styles)\/.+\.css$/.test(path)
  || /^public\/.+\.(?:png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf)$/.test(path);

// These verification-only paths do not ship to the browser. Application/API helpers,
// migrations, shared fixtures, dependencies and CI configuration deliberately stay full.
const isDatabaseHarness = (path) => /^tests\/database\/.+\.test\.(?:ts|mjs)$/.test(path)
  || /^scripts\/check-(?:database|supabase)-[^/]+\.mjs$/.test(path);

export function classifyPaths(paths) {
  if (!paths.length) return full('No changed paths could be established.');
  const executable = paths.filter((path) => !isDocumentation(path));
  if (!executable.length) return {
    runFull: false, runDatabase: false, runResponsive: false,
    reason: 'Only allowlisted documentation or LICENSE changed.',
  };
  if (executable.every(isPresentationAsset)) return {
    runFull: true, runDatabase: false, runResponsive: true,
    reason: 'Only presentation assets changed; retain all viewports, skip database-specific suites.',
  };
  if (executable.every(isDatabaseHarness)) return {
    runFull: true, runDatabase: true, runResponsive: false,
    reason: 'Only database verification harnesses changed; retain database suites and desktop E2E.',
  };
  return full('Application, configuration, migration, mixed, or unclassified paths changed.');
}

export function classifyEvent(eventName, event, cwd = process.cwd()) {
  if (eventName !== 'pull_request') return full('Main, scheduled, manual and other events run full verification.');
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    let base = event.pull_request?.base?.sha;
    const head = event.pull_request?.head?.sha;
    const validSha = (sha) => typeof sha === 'string' && /^[a-f0-9]{40}$/i.test(sha) && !/^0+$/.test(sha);
    if (!validSha(base) || !validSha(head)) return full('Missing or invalid comparison commits.');
    git('cat-file', '-e', `${base}^{commit}`);
    git('cat-file', '-e', `${head}^{commit}`);
    base = git('merge-base', base, head);
    // Disable rename detection so both the removed and added paths are classified.
    const names = execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', base, head], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).split('\0').filter(Boolean);
    return classifyPaths(names);
  } catch {
    return full('Comparison history is unavailable; full verification is required.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try {
    result = classifyEvent(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
  } catch {
    result = full('Event data is unavailable; full verification is required.');
  }
  console.log(result.reason);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run_full=${result.runFull}\nrun_database=${result.runDatabase}\nrun_responsive=${result.runResponsive}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Verification scope\n\n${result.reason}\n\nApplication checks: **${result.runFull ? 'required' : 'not applicable'}**.\nDatabase suites: **${result.runDatabase ? 'required' : 'not applicable'}**.\nAll viewports: **${result.runResponsive ? 'required' : 'not applicable'}**.\n`);
}
