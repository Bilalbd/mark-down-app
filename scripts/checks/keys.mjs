/**
 * Formatting shortcuts with real key events in the source editor: text and selection after each
 * one, undo, and that the shortcuts do nothing while focus is in the Split view's preview.
 * Usage: node scripts/checks/keys.mjs   (needs a document open)
 */
import { connect, reporter, wait } from './lib.mjs';

const app = await connect();
const r = reporter();

const cases = [
  ['hello world', 8, 8, ['ctrl+b'], 'hello **world**', [10, 10]],
  ['hello **world**', 10, 10, ['ctrl+b'], 'hello world', [8, 8]],
  ['hello world', 0, 5, ['ctrl+i'], '*hello* world', [1, 6]],
  ['hello world', 9, 9, ['ctrl+k'], 'hello [world](url)', [14, 17]],
  ['Title', 2, 2, ['ctrl+shift+1'], '# Title', null],
  ['Title', 2, 2, ['ctrl+shift+2'], '## Title', null],
  ['Title', 2, 2, ['ctrl+shift+3'], '### Title', null],
  ['Title', 2, 2, ['ctrl+shift+4'], '#### Title', null],
  ['Title', 2, 2, ['ctrl+shift+5'], '##### Title', null],
  ['Title', 2, 2, ['ctrl+shift+6'], '###### Title', null],
  ['## Title', 4, 4, ['ctrl+shift+2'], 'Title', null],
  // No Ctrl+Shift+0: Windows reserves it (see SourceEditor.tsx).
  ['## Title', 4, 4, ['ctrl+shift+3'], '### Title', null],
  ['hello world', 8, 8, ['ctrl+b', 'ctrl+z'], 'hello world', null],
  ['## Title', 4, 4, ['ctrl+shift+1', 'ctrl+z'], '## Title', null],
];

if (!(await app.js('return window.__mdv.document.getState().hasDocument;'))) {
  throw new Error('Open a document first (launch.ps1 -File fixtures/gfm.md).');
}
await app.setting('viewMode', 'source');
await wait(400);
for (const [doc, from, to, keys, want, sel] of cases) {
  await app.setDoc(doc, from, to);
  for (const k of keys) await app.press(k);
  const got = await app.readDoc();
  const ok = got.text === want && (!sel || (got.from === sel[0] && got.to === sel[1]));
  r.check(
    `${keys.join(', ')} on ${JSON.stringify(doc)}`,
    ok,
    `${JSON.stringify(got.text)} sel ${got.from}-${got.to}`,
  );
}

await app.setting('viewMode', 'split');
await wait(500);
await app.setDoc('hello world', 8, 8);
await app.press('ctrl+b');
r.check('split, editor focused: Ctrl+B formats', (await app.readDoc()).text === 'hello **world**');
await app.js(
  `const p = document.querySelector('.preview-scroll'); p.setAttribute('tabindex', '-1'); p.focus(); return 1;`,
);
await app.press('ctrl+b');
r.check(
  'split, preview focused: Ctrl+B does nothing',
  (await app.readDoc()).text === 'hello **world**',
);

await app.restoreDoc();
await app.setting('viewMode', 'formatted');
app.close();
r.done();
