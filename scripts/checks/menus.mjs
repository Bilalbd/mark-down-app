/**
 * Right-click menus with real mouse and key events: spelling suggestions, Ignore, Add to
 * dictionary, keyboard navigation and the Heading submenu, every formatting item, the Menu key
 * and Shift+F10, the default menu staying off the chrome, and the preview's menu in Split view.
 * Usage: node scripts/checks/menus.mjs [--shots <dir>] [--clipboard]
 *   --clipboard also checks Cut and Paste, which overwrites the Windows clipboard.
 */
import { join } from 'node:path';
import { args, connect, fixture, reporter, wait } from './lib.mjs';

const opts = args();
const app = await connect();
const r = reporter();
const shot = (name) => opts.shots && app.shot(join(String(opts.shots), `${name}.png`));

const V = 'const v = window.__mdv.view.getState().editorView;';
const doc = async () => (await app.readDoc()).text;
const coordsOf = (word) =>
  app.js(`${V} const i = v.state.doc.toString().indexOf(${JSON.stringify(word)}); if (i < 0) return null;
    const c = v.coordsAtPos(Math.min(i + 1, v.state.doc.length));
    return { x: Math.round(c.left), y: Math.round((c.top + c.bottom) / 2) };`);
const rightClickOn = async (word, dx = 0) => {
  const c = await coordsOf(word);
  await app.mouse(c.x + dx, c.y, 'right');
};
const menuItems = () =>
  app.js(`return [...document.querySelectorAll('[role=menu]')].map((m) => [...m.querySelectorAll(':scope [role=menuitem]')]
    .map((b) => (b.disabled ? '(' : '') + b.textContent.trim() + (b.disabled ? ')' : '')));`);
const clickItem = (label) => app.click('[role=menuitem]', label);
const squiggled = () =>
  app.js(`return [...document.querySelectorAll('.cm-misspelled')].map((e) => e.textContent);`);

// Setup: the spelling fixture in Source view, English only, no ignored or added words.
const words0 = await app.js('return window.__mdv.settings.getState().spellWords;');
await app.setting('spellWords', []);
await app.setting('spellLanguages', ['en']);
await app.js('window.__mdv.view.setState({ spellIgnored: new Set() }); return 1;');
await app.open(fixture('spelling.md'));
await app.setting('viewMode', 'source');
for (let i = 0; i < 30 && !(await squiggled()).length; i++) await wait(200);
await wait(300);
const original = await doc();

// 1. Suggestions on a misspelled word; replace, then undo.
await rightClickOn('sentance');
let items = await menuItems();
r.check(
  'menu on a misspelled word leads with the suggestion',
  items[0]?.[0] === 'sentence',
  JSON.stringify(items[0]),
);
await shot('editor-menu');
await clickItem('sentence');
r.check('suggestion replaces the word', (await doc()).includes('This sentence has'));
await app.js(`${V} v.focus(); return 1;`);
await app.press('ctrl+z');
r.check('Ctrl+Z restores it', (await doc()) === original);

// 2. Ignore and Add to dictionary.
await rightClickOn('seccond');
await clickItem('Ignore');
await wait(300);
r.check('Ignore removes the squiggle', !(await squiggled()).includes('seccond'));
await rightClickOn('mistaks');
await clickItem('Add to dictionary');
await wait(600);
const words = await app.js('return window.__mdv.settings.getState().spellWords;');
r.check(
  'Add to dictionary',
  words.includes('mistaks') && !(await squiggled()).includes('mistaks'),
  JSON.stringify(words),
);

// 3. A correct word: no spelling section, Escape, keyboard into the Heading submenu.
await app.setDoc('Plain line of text', 3);
await rightClickOn('Plain');
items = await menuItems();
r.check(
  'menu on a correct word has no spelling section',
  !items[0]?.includes('Ignore'),
  JSON.stringify(items[0]),
);
await app.press('Escape');
r.check('Escape closes the menu', (await menuItems()).length === 0);
r.check(
  'focus returns to the editor',
  await app.js(`return document.activeElement?.classList.contains('cm-content') ?? false;`),
);
await rightClickOn('Plain');
const focused = () => app.js(`return document.activeElement?.textContent?.trim() ?? ''`);
await app.press('ArrowDown');
for (let i = 0; i < 12 && !(await focused()).startsWith('Heading'); i++)
  await app.press('ArrowDown');
await app.press('ArrowRight');
await shot('heading-submenu');
items = await menuItems();
r.check('ArrowRight opens the Heading submenu', items.length === 2, JSON.stringify(items[1] ?? []));
await app.press('ArrowLeft');
r.check('ArrowLeft closes the submenu', (await menuItems()).length === 1);
await app.press('ArrowRight');
await app.press('Enter');
r.check(
  'Heading 1 by keyboard',
  (await doc()) === '# Plain line of text',
  JSON.stringify(await doc()),
);

// 4. Every formatting item, by mouse.
const cases = [
  ['Bold', 'hello world', 0, 5, '**hello** world'],
  ['Italic', 'hello world', 0, 5, '*hello* world'],
  ['Strikethrough', 'hello world', 0, 5, '~~hello~~ world'],
  ['Inline code', 'hello world', 0, 5, '`hello` world'],
  ['Link', 'hello world', 0, 5, '[hello](url) world'],
  ['Code block', 'a\nb', 0, 3, '```\na\nb\n```'],
  ['Quote', 'a\nb', 0, 3, '> a\n> b'],
  ['Bulleted list', 'a\nb', 0, 3, '- a\n- b'],
  ['Numbered list', 'a\nb', 0, 3, '1. a\n2. b'],
  ['Task list', 'a\nb', 0, 3, '- [ ] a\n- [ ] b'],
  ['Horizontal rule', 'a', 1, 1, 'a\n\n---\n'],
];
for (const [label, text, from, to, want] of cases) {
  await app.setDoc(text, from, to);
  await rightClickOn(text[0]);
  await clickItem(label);
  const got = await doc();
  r.check(`menu: ${label}`, got === want, JSON.stringify(got));
}

// 5. Cut and Paste use the real clipboard, so only on request.
if (opts.clipboard) {
  await app.setDoc('alpha beta', 6, 10);
  await rightClickOn('beta');
  await clickItem('Cut');
  await wait(400);
  r.check('Cut removes the selection', (await doc()) === 'alpha ', JSON.stringify(await doc()));
  await app.setDoc('alpha ', 6);
  await rightClickOn('alpha', 60);
  await clickItem('Paste');
  await wait(500);
  r.check('Paste puts it back', (await doc()) === 'alpha beta', JSON.stringify(await doc()));
} else {
  r.note('Cut/Paste skipped (pass --clipboard to check them; it overwrites the clipboard)');
}

// 6. Menu key and Shift+F10.
await app.setDoc('keyboard menu', 4);
await app.press('ContextMenu');
r.check('Menu key opens the menu', (await menuItems()).length === 1);
await app.press('Escape');
await app.press('shift+F10');
r.check('Shift+F10 opens the menu', (await menuItems()).length === 1);
await app.press('Escape');

// 7. The browser's own menu is suppressed on the chrome but kept in text inputs.
await app.js(`window.__cmLog = []; addEventListener('contextmenu', (e) => window.__cmLog.push(
  [e.target.closest('input,textarea') ? 'input' : 'chrome', e.defaultPrevented])); return 1;`);
for (const sel of ['.titlebar', '.toolbar', '.statusbar']) await app.click(sel, undefined, 'right');
const settingsOpen = () => app.js(`return !!document.querySelector('.settings');`);
if (!(await settingsOpen())) await app.click('[aria-label="Settings"]');
await wait(400);
await app.click('.settings [role=tab]', 'Editor');
await wait(300);
await app.click(
  '.settings input[type=text], .settings input[type=number], .settings textarea',
  undefined,
  'right',
);
await app.press('Escape');
if (await settingsOpen()) await app.click('[aria-label="Settings"]');
await wait(300);
const log = await app.js('return window.__cmLog;');
r.check(
  'chrome right-clicks prevented, input right-clicks not',
  log.filter((l) => l[0] === 'chrome').every((l) => l[1]) &&
    log.some((l) => l[0] === 'input' && !l[1]),
  JSON.stringify(log),
);

// 8. Split view: the preview's own menu.
await app.setDoc(original, 0);
await app.setting('viewMode', 'split');
await wait(800);
await app.click('.preview-scroll p', undefined, 'right');
items = await menuItems();
r.check(
  'preview menu is Copy (disabled) and Select all',
  items.length === 1 && items[0].length === 2,
  JSON.stringify(items),
);
await shot('preview-menu');
await clickItem('Select all');
r.check(
  'Select all selects the preview only',
  await app.js(
    `const s = getSelection(); return s.toString().length > 20 && document.querySelector('.preview-scroll').contains(s.anchorNode);`,
  ),
);
await app.press('Escape');

await app.restoreDoc();
await app.setting('spellWords', words0);
await app.js('window.__mdv.view.setState({ spellIgnored: new Set() }); return 1;');
await app.setting('viewMode', 'formatted');
app.close();
r.done();
