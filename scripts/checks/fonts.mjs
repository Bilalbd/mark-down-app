/**
 * Font checks, in light and dark: every built-in font loads its Latin faces (and Arabic faces for
 * the Arabic fonts) and nothing for other alphabets, and text set in it measures differently from
 * its fallback, so it really renders. Then drives the font picker in Settings → Appearance: groups,
 * search, keyboard, the monospace and Arabic filters, picking built-in and installed fonts into the
 * preview, Same as body, the custom CSS mode, and every built-in preset showing its fonts. With
 * --shots, saves a font specimen, the Unicode fixture in Arabic fonts and the open picker.
 * Usage: node scripts/checks/fonts.mjs [--shots <dir>]
 */
import { join } from 'node:path';
import { args, connect, fixture, reporter, wait } from './lib.mjs';

const opts = args();
const app = await connect();
const r = reporter();
const theme0 = await app.js('return window.__mdv.settings.getState().appTheme;');
const view0 = await app.js('return window.__mdv.settings.getState().viewMode;');

// Vite serves the source modules, so the check reads the same list the app uses.
const FONTS = `const { BUILTIN_FONTS } = await import('/src/lib/fonts.ts');`;
const LATIN = 'Hamburgefonstiv 0123 ąęłŐű';
const ARABIC = 'هذا نص عربي لاختبار الخط';

const builtins = await app.js(`${FONTS} return BUILTIN_FONTS;`);
r.check('built-in list', builtins.length === 19, `${builtins.length} fonts`);

const faces = await app.js(`${FONTS}
  const load = async (font, text, style = '') =>
    (await document.fonts.load(style + "16px '" + font.cssName + "'", text))
      .filter((f) => f.status === 'loaded').length;
  // Canvas text uses the loaded web fonts, so a width that differs from the fallback's means the
  // font itself was used.
  const ctx = document.createElement('canvas').getContext('2d');
  const width = (family, text) => { ctx.font = '32px ' + family; return ctx.measureText(text).width; };
  const out = [];
  for (const f of BUILTIN_FONTS) {
    const fallback = f.monospace ? 'monospace' : 'serif';
    out.push({
      css: f.cssName, arabic: f.arabic,
      latin: await load(f, ${JSON.stringify(LATIN)}),
      italic: await load(f, 'Ham', 'italic '),
      // No spaces or Latin letters here: those would match the Latin faces.
      arabicFaces: await load(f, 'عربي'),
      other: await load(f, 'ПриветΓειάệ'),
      latinDiffers: width("'" + f.cssName + "', " + fallback, ${JSON.stringify(LATIN)}) !== width(fallback, ${JSON.stringify(LATIN)}),
      arabicDiffers: width("'" + f.cssName + "', " + fallback, ${JSON.stringify(ARABIC)}) !== width(fallback, ${JSON.stringify(ARABIC)}),
    });
  }
  return out;`);
for (const f of faces) {
  const ok =
    f.latin >= 2 &&
    f.latinDiffers &&
    f.other === 0 &&
    (f.arabic ? f.arabicFaces > 0 && f.arabicDiffers : f.arabicFaces === 0);
  // other alphabets = faces for Cyrillic, Greek or Vietnamese, which aren't bundled.
  r.check(
    `font ${f.css}`,
    ok,
    `latin faces=${f.latin} italic=${f.italic} arabic faces=${f.arabicFaces} other alphabets=${f.other}` +
      ` renders=${f.latinDiffers}${f.arabic ? ` arabic renders=${f.arabicDiffers}` : ''}`,
  );
}

if (opts.shots) {
  await app.setting('viewMode', 'formatted');
  await app.open(fixture('unicode.md'));
  await wait(800);
  const specimen = builtins
    .map(
      (f) =>
        `<div style="font-family:'${f.cssName}', ${f.monospace ? 'monospace' : 'serif'};font-size:17px;line-height:1.55">` +
        `${f.family}: The quick brown fox jumps over 0O1lI {}` +
        (f.arabic ? ` · ${ARABIC}` : ' <i>italic</i> <b>bold</b>') +
        '</div>',
    )
    .join('');
  for (const theme of ['light', 'dark']) {
    await app.setting('appTheme', theme);
    await app.js(`const p = document.querySelector('.preview-scroll .preview');
      const d = document.createElement('div'); d.id = 'font-specimen'; d.innerHTML = ${JSON.stringify(specimen)};
      p.prepend(d); p.closest('.preview-scroll').scrollTop = 0; await document.fonts.ready; return 1;`);
    await wait(500);
    await app.shot(join(String(opts.shots), `fonts-specimen-${theme}.png`));
    await app.js(`document.getElementById('font-specimen')?.remove(); return 1;`);
    await app.js(`const p = document.querySelector('.preview-scroll .preview');
      p.style.setProperty('--md-font-body', "'IBM Plex Sans Arabic', 'Segoe UI', sans-serif");
      p.style.setProperty('--md-font-heading', "'Noto Naskh Arabic Variable', Georgia, serif");
      await document.fonts.ready; return 1;`);
    await wait(500);
    await app.shot(join(String(opts.shots), `fonts-arabic-${theme}.png`));
    await app.js(`const p = document.querySelector('.preview-scroll .preview');
      p.style.removeProperty('--md-font-body'); p.style.removeProperty('--md-font-heading'); return 1;`);
  }
}

// ---- The font picker in Settings → Appearance ----
// Picking fonts edits the active preset; the store is put back at the end (and stop.ps1 restores
// presets.json on disk).
const style0 = await app.js(`const s = window.__mdv.style.getState();
  return JSON.stringify({ presets: s.presets, activePresetId: s.activePresetId });`);
await app.setting('viewMode', 'formatted');
await app.open(fixture('gfm.md'));

const btn = (label) => `.font-picker__button[aria-label^="${label}:"]`;
const labelOf = (label) =>
  app.js(
    `return document.querySelector(${JSON.stringify(btn(label))})?.getAttribute('aria-label') ?? null;`,
  );
const clickSel = async (sel) => {
  const c =
    await app.js(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
    e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`);
  if (!c) return false;
  await app.mouse(c.x, c.y);
  return true;
};
const typeText = async (text) => {
  await app.send('Input.insertText', { text });
  await wait(300);
};
const clearSearch = async () => {
  await app.press('ctrl+a');
  await app.press('Backspace');
  await wait(200);
};
const popover = () =>
  app.js(`const p = document.querySelector('.font-picker__popover'); if (!p) return null;
    const opts = [...p.querySelectorAll('[role=option]')];
    const input = p.querySelector('[role=combobox]');
    const active = input && document.getElementById(input.getAttribute('aria-activedescendant'));
    return {
      groups: [...p.querySelectorAll('.font-picker__group')].map((g) => g.textContent.trim()),
      fonts: opts.filter((o) => !o.classList.contains('is-action')).map((o) => ({
        name: o.querySelector('.font-picker__row-name')?.textContent,
        tag: o.querySelector('.font-picker__row-tag')?.textContent ?? '' })),
      actions: opts.filter((o) => o.classList.contains('is-action')).map((o) => o.textContent.trim()),
      active: active?.textContent.trim() ?? null,
      focused: document.activeElement === input,
    };`);
// Which fonts cover Arabic, from the same sources the picker uses.
const arabicNames = await app.js(`${FONTS}
  const sys = window.__TAURI_INTERNALS__ ? await window.__TAURI_INTERNALS__.invoke('list_system_fonts') : [];
  return [...BUILTIN_FONTS.filter((f) => f.arabic).map((f) => f.family), ...sys.filter((f) => f.arabic).map((f) => f.family)];`);
const previewFont = (sel) =>
  app.js(`const e = document.querySelector('.preview-scroll .preview ${sel}');
    return e ? getComputedStyle(e).fontFamily : null;`);
const shot = (name, theme) =>
  opts.shots ? app.shot(join(String(opts.shots), `picker-${name}-${theme}.png`)) : null;

for (const theme of ['light', 'dark']) {
  await app.setting('appTheme', theme);
  await app.js(`window.__mdv.style.setState(${style0}); return 1;`);
  if (!(await app.js(`return !!document.querySelector('.settings');`)))
    await app.click('[aria-label="Settings"]');
  await wait(400);
  await app.click('.settings [role=tab]', 'Appearance');
  await wait(300);
  await app.click('.settings [role=tabpanel] button', 'Fonts & colours');
  await wait(400);

  // Body font: groups, one JetBrains Mono, search, keyboard, Escape.
  await clickSel(btn('Body font'));
  let p = await popover();
  r.check(
    `${theme} picker opens with the three groups`,
    p?.focused && ['Built in', 'On this PC', 'Google Fonts'].every((g) => p.groups.includes(g)),
    `groups=${p?.groups.join(' | ')} rows=${p?.fonts.length} actions=${p?.actions.join(' | ')}`,
  );
  await shot('body', theme);
  await typeText('jetbrains');
  p = await popover();
  r.check(
    `${theme} JetBrains Mono listed once, under Built in`,
    p.fonts.filter((f) => f.name === 'JetBrains Mono').length === 1 &&
      p.groups.join() === 'Built in',
    `rows=${p.fonts.map((f) => f.name).join(', ')} groups=${p.groups.join(', ')}`,
  );
  await clearSearch();
  await typeText('casc');
  p = await popover();
  r.check(
    `${theme} search "casc"`,
    p.fonts.length > 0 && p.fonts.every((f) => f.name.toLowerCase().includes('casc')),
    p.fonts.map((f) => f.name).join(', '),
  );
  await clearSearch();
  const moves = [];
  for (const key of ['Home', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'End']) {
    await app.press(key);
    moves.push((await popover()).active);
  }
  r.check(
    `${theme} keyboard Home/Down/Up/End`,
    moves[0] !== moves[1] &&
      moves[1] !== moves[2] &&
      moves[3] === moves[1] &&
      moves[4] === 'Custom CSS font list…',
    moves.join(' → '),
  );
  await app.press('Escape');
  const afterEsc =
    await app.js(`return { popover: !!document.querySelector('.font-picker__popover'),
    settings: !!document.querySelector('.settings'),
    focus: document.activeElement?.matches(${JSON.stringify(btn('Body font'))}) ?? false };`);
  r.check(
    `${theme} Escape closes only the list, focus back on the button`,
    !afterEsc.popover && afterEsc.settings && afterEsc.focus,
    JSON.stringify(afterEsc),
  );

  // Pick a built-in body font with the keyboard.
  await app.press('ArrowDown');
  await typeText('lora');
  await app.press('Enter');
  await wait(400);
  r.check(
    `${theme} Lora applied to the body`,
    (await labelOf('Body font'))?.startsWith('Body font: Lora, Built in') &&
      (await previewFont('p'))?.includes('Lora Variable'),
    `${await labelOf('Body font')} / preview p: ${await previewFont('p')}`,
  );

  // Code font: monospace only; pick an installed font with the mouse.
  await clickSel(btn('Code font'));
  p = await popover();
  r.check(
    `${theme} Code font lists monospace fonts only`,
    // Downloaded Google fonts read "Mono · Downloaded".
    p.fonts.length > 0 && p.fonts.every((f) => f.tag.startsWith('Mono')),
    `${p.fonts.length} rows: ${p.fonts.map((f) => f.name).join(', ')}`,
  );
  await shot('code', theme);
  await typeText('cascadia code');
  await clickSel('.font-picker__popover [role=option]:not(.is-action)');
  await wait(400);
  const codeFont = await previewFont('code');
  r.check(
    `${theme} Cascadia Code (on this PC) applied to code`,
    (await labelOf('Code font'))?.startsWith('Code font: Cascadia Code, On this PC') &&
      /^["']?Cascadia Code/.test(codeFont ?? ''),
    `${await labelOf('Code font')} / preview code: ${codeFont}`,
  );

  // Supports Arabic.
  await clickSel(btn('Body font'));
  await clickSel('.font-picker__filter input');
  p = await popover();
  // The Google catalogue (loaded when the picker opened) adds the fonts with an Arabic subset.
  const googleArabic = await app.js(`const { useFontsStore } = await import('/src/store/fonts.ts');
    return (useFontsStore.getState().catalog ?? []).filter((f) => f.subsets.includes('arabic')).map((f) => f.family);`);
  const notArabic = p.fonts.filter(
    (f) => !arabicNames.includes(f.name) && !googleArabic.includes(f.name),
  );
  r.check(
    `${theme} Supports Arabic filter`,
    p.fonts.length > 0 && notArabic.length === 0,
    `${p.fonts.length} rows` +
      (notArabic.length ? `; not Arabic: ${notArabic.map((f) => f.name)}` : ''),
  );
  await shot('arabic', theme);
  await app.press('Escape');

  // Heading font: Same as body.
  await clickSel(btn('Heading font'));
  p = await popover();
  await clickSel('.font-picker__popover [role=option]');
  await wait(300);
  r.check(
    `${theme} Heading "Same as body"`,
    p.actions[0] === 'Same as body' &&
      (await labelOf('Heading font')) === 'Heading font: Same as body' &&
      (await app.js('return window.__mdv.style.getState().active().typography.headingFont;')) ===
        '',
    `first row=${p.actions[0]} label=${await labelOf('Heading font')}`,
  );

  // Custom mode round trip on the Code font.
  await clickSel(btn('Code font'));
  await app.press('End');
  await app.press('Enter');
  await wait(300);
  const input = await app.js(`const i = document.activeElement;
    return i?.matches('.font-picker .settings__text') ? i.value : null;`);
  await app.press('ctrl+a');
  await typeText('Consolas, monospace');
  await wait(700);
  const stored = await app.js('return window.__mdv.style.getState().active().typography.monoFont;');
  await shot('custom', theme);
  await app.click('.font-picker__link', 'Choose from list');
  await wait(300);
  r.check(
    `${theme} custom CSS font list round trip`,
    input?.startsWith("'Cascadia Code'") &&
      stored === 'Consolas, monospace' &&
      (await labelOf('Code font'))?.startsWith('Code font: Consolas, On this PC'),
    `input was "${input}", stored "${stored}", then ${await labelOf('Code font')}`,
  );

  // Every built-in preset shows its current fonts (Charter isn't on Windows).
  const presets = await app.js(
    `return window.__mdv.style.getState().presets.filter((p) => p.builtin).map((p) => p.id);`,
  );
  for (const id of presets) {
    await app.js(
      `window.__mdv.style.setState({ activePresetId: ${JSON.stringify(id)} }); return 1;`,
    );
    await wait(250);
    const labels = [
      await labelOf('Body font'),
      await labelOf('Heading font'),
      await labelOf('Code font'),
    ];
    const bad = labels.filter((l) => !l || (l.includes('Not installed') && !l.includes('Charter')));
    r.check(
      `${theme} preset ${id}`,
      bad.length === 0,
      labels.map((l) => l?.replace(/^\w+ font: /, '')).join(' | '),
    );
  }
  await app.js(`window.__mdv.style.setState(${style0}); return 1;`);
  await app.click('[aria-label="Settings"]');
  await wait(300);
}

await app.setting('appTheme', theme0);
await app.setting('viewMode', view0);
app.close();
r.done();
