/**
 * Opens Settings and visits every page in light and dark with real clicks, listing each page's
 * section titles and (with --shots) saving a screenshot of each.
 * Usage: node scripts/checks/settings.mjs [--shots <dir>]
 */
import { join } from 'node:path';
import { args, connect, reporter, wait } from './lib.mjs';

const PAGES = ['General', 'Editor', 'Appearance', 'Shortcuts', 'About'];
const opts = args();
const app = await connect();
const r = reporter();
const theme0 = await app.js('return window.__mdv.settings.getState().appTheme;');
const isOpen = () => app.js(`return !!document.querySelector('.settings');`);

for (const theme of ['light', 'dark']) {
  await app.setting('appTheme', theme);
  if (!(await isOpen())) await app.click('[aria-label="Settings"]');
  await wait(400);
  for (const page of PAGES) {
    const found = await app.click('.settings [role=tab]', page);
    await wait(300);
    const selected = await app.js(
      `return document.querySelector('.settings [role=tab][aria-selected=true]')?.textContent.trim();`,
    );
    const text = await app.js(
      `return document.querySelector('.settings [role=tabpanel]')?.innerText.length ?? 0;`,
    );
    r.check(`${theme} ${page}`, found && selected === page && text > 0, `${text} chars`);
    if (opts.shots)
      await app.shot(join(String(opts.shots), `settings-${page.toLowerCase()}-${theme}.png`));
  }
}
await app.click('[aria-label="Settings"]');
await app.setting('appTheme', theme0);
app.close();
r.done();
