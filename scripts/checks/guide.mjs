/**
 * The built-in guide: F1, the toolbar button and (on the start screen) the "Read the guide" link
 * open one guide window, and pressing F1 again doesn't open a second one.
 * Usage: node scripts/checks/guide.mjs
 */
import { connect, reporter, wait } from './lib.mjs';

const PORT = process.env.CDP_PORT ?? '9222';
const guideWindows = async () =>
  (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter(
    (t) => t.type === 'page' && t.url.includes('#guide'),
  ).length;
const settle = async (want) => {
  for (let i = 0; i < 20 && (await guideWindows()) !== want; i++) await wait(250);
  return guideWindows();
};

const app = await connect();
const r = reporter();

const before = await guideWindows();
r.check(
  'toolbar button tooltip',
  (await app.js(`return document.querySelector('[aria-label="Guide"]')?.title;`)) === 'Guide (F1)',
);
if (!before && (await app.center('.link-button', 'New here? Read the guide'))) {
  await app.click('.link-button', 'New here? Read the guide');
  r.check('start-screen link opens the guide window', (await settle(1)) === 1);
} else {
  await app.js('document.body.focus(); return 1;');
  await app.press('F1');
  r.check('F1 opens the guide window', (await settle(1)) === 1);
}
await app.js('document.body.focus(); return 1;');
await app.press('F1');
await wait(800);
r.check('F1 again keeps one guide window', (await guideWindows()) === 1);
await app.click('[aria-label="Guide"]');
await wait(800);
r.check('Guide button keeps one guide window', (await guideWindows()) === 1);
r.check(
  'the guide is not in recent files',
  !(await app.js(`return window.__mdv.settings.getState().recentFiles;`)).some((f) =>
    /Guide\.md$/i.test(f),
  ),
);

app.close();
r.done();
