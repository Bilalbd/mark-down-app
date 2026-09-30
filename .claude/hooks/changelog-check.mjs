// Claude Code PostToolUse hook (Bash|PowerShell): after a `git commit`, tells Claude when the new
// commit isn't logged in CHANGELOG.md, so it adds the entry in a follow-up commit. Silent otherwise.
// Commits that are exempt: WIP commits, commits touching only CHANGELOG.md or docs/changes/, and
// commits on a branch that already changed CHANGELOG.md (a feature logged once for several commits).
import { execFileSync } from 'node:child_process';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let payload;
try {
  payload = JSON.parse(input);
} catch {
  process.exit(0);
}

const command = String(payload.tool_input?.command ?? '');
if (!/\bgit(\s+-C\s+("[^"]*"|\S+))?\s+commit\b/.test(command)) process.exit(0);

const cwd = payload.cwd || process.cwd();
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

const head = git('log', '-1', '--format=%ct%n%s');
if (!head) process.exit(0);
const [time, subject] = head.split('\n');
// The commit must have just been made by this command; otherwise it failed or wasn't ours.
if (Date.now() / 1000 - Number(time) > 120) process.exit(0);
if (/^wip\b/i.test(subject)) process.exit(0);

const files = (git('diff-tree', '--no-commit-id', '--name-only', '-r', '--root', 'HEAD') ?? '')
  .split('\n')
  .filter(Boolean);
if (!files.length || files.includes('CHANGELOG.md')) process.exit(0);
if (files.every((f) => f.startsWith('docs/changes/'))) process.exit(0);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch && branch !== 'main') {
  const base = git('merge-base', 'HEAD', 'main');
  if (base && git('diff', '--name-only', base, 'HEAD', '--', 'CHANGELOG.md')) process.exit(0);
}

console.log(
  JSON.stringify({
    decision: 'block',
    reason:
      `The commit "${subject}" isn't logged in CHANGELOG.md. Add a one-line entry under ` +
      '[Unreleased] (Added / Changed / Fixed / Removed / Development), plus a docs/changes/ note ' +
      'if it is a larger feature or a tricky bug fix, and commit it as a follow-up ' +
      '(never amend). If this commit genuinely needs no entry, say why to the user.',
  }),
);
