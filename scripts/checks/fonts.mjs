/**
 * Font checks, in light and dark: every built-in font loads its Latin faces (and Arabic faces for
 * the Arabic fonts) and nothing for other alphabets, and text set in it measures differently from
 * its fallback, so it really renders. With --shots, saves a specimen of every built-in font and
 * the Unicode fixture with its body in an Arabic font.
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

await app.setting('appTheme', theme0);
await app.setting('viewMode', view0);
app.close();
r.done();
