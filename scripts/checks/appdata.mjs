/**
 * Backs up and restores the app's own files in %APPDATA% around a check run. The dev app and an
 * installed copy share them, so a check must leave them as it found them.
 *
 *   node scripts/checks/appdata.mjs backup    (keeps an existing backup from the same run)
 *   node scripts/checks/appdata.mjs restore   (puts changed values back, then drops the backup)
 *
 * settings.json is restored key by key. `recentFiles` goes back to what it was, plus any new
 * entries outside the repository and the temp folder: those are the user's own, opened in the
 * installed app during the run.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROOT } from './lib.mjs';

const DATA = join(process.env.APPDATA, 'com.bilal.markdown-viewer');
const BACKUP = join(tmpdir(), 'mdv-checks', 'appdata-backup');
const FILES = ['settings.json', 'presets.json', '.window-state.json'];

const cmd = process.argv[2];
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

if (cmd === 'backup') {
  if (existsSync(BACKUP)) {
    console.log('Keeping the backup from earlier in this run.');
  } else {
    mkdirSync(BACKUP, { recursive: true });
    for (const f of FILES)
      if (existsSync(join(DATA, f))) copyFileSync(join(DATA, f), join(BACKUP, f));
    console.log(`Backed up ${DATA}`);
  }
} else if (cmd === 'restore') {
  if (!existsSync(BACKUP)) {
    console.log('No backup to restore.');
    process.exit(0);
  }
  const lower = (p) => resolve(p).toLowerCase();
  const scratch = [lower(ROOT), lower(tmpdir())];
  const isCheckFile = (p) => scratch.some((dir) => lower(p).startsWith(dir));

  for (const f of FILES) {
    const before = read(join(BACKUP, f));
    const now = read(join(DATA, f));
    if (before === null || now === null || before === now) continue;
    if (f !== 'settings.json') {
      writeFileSync(join(DATA, f), before);
      console.log(`Restored ${f}`);
      continue;
    }
    const b = JSON.parse(before);
    const n = JSON.parse(now);
    const changed = [];
    for (const key of new Set([...Object.keys(b), ...Object.keys(n)])) {
      if (key === 'recentFiles') continue;
      if (JSON.stringify(b[key]) === JSON.stringify(n[key])) continue;
      if (key in b) n[key] = b[key];
      else delete n[key];
      changed.push(key);
    }
    // Files opened by a check push the user's entries off the end of the list (it holds 5), so
    // rebuild it: the user's own new entries first, then everything that was there before.
    const had = b.recentFiles ?? [];
    const added = (n.recentFiles ?? []).filter((p) => !had.includes(p) && !isCheckFile(p));
    const recent = [...added, ...had].slice(0, 5);
    if (JSON.stringify(recent) !== JSON.stringify(n.recentFiles ?? [])) {
      n.recentFiles = recent;
      changed.push('recentFiles');
    }
    writeFileSync(join(DATA, f), JSON.stringify(n, null, 2));
    console.log(`Restored settings.json keys: ${changed.join(', ') || '(formatting only)'}`);
  }
  rmSync(BACKUP, { recursive: true });
} else {
  console.error('Usage: node appdata.mjs backup|restore');
  process.exitCode = 1;
}
