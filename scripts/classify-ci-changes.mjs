import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const full = (reason) => ({ runFull: true, reason });

export function classifyPaths(paths) {
  if (!paths.length) return full('No changed paths could be established.');
  const isDocumentation = (path) => path === 'README.md'
    || path === 'LICENSE'
    || /^docs\/(?:[^/]+\/)*[^/]+\.md$/.test(path);
  return paths.every(isDocumentation)
    ? { runFull: false, reason: 'Only allowlisted Markdown documentation or LICENSE changed.' }
    : full('Application, configuration, test, or unclassified paths changed.');
}

export function classifyEvent(eventName, event, cwd = process.cwd()) {
  if (!['pull_request', 'push'].includes(eventName)) return full('Manual and other events run full verification.');
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    let base = eventName === 'pull_request' ? event.pull_request?.base?.sha : event.before;
    const head = eventName === 'pull_request' ? event.pull_request?.head?.sha : event.after;
    const validSha = (sha) => typeof sha === 'string' && /^[a-f0-9]{40}$/i.test(sha) && !/^0+$/.test(sha);
    if (!validSha(base) || !validSha(head)) return full('Missing or invalid comparison commits.');
    git('cat-file', '-e', `${base}^{commit}`);
    git('cat-file', '-e', `${head}^{commit}`);
    if (eventName === 'pull_request') base = git('merge-base', base, head);
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
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run_full=${result.runFull}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Verification scope\n\n${result.reason}\n\nFull checks: **${result.runFull ? 'required' : 'not applicable'}**.\n`);
}
