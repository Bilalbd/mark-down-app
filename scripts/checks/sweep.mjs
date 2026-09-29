/**
 * Regression sweep: opens every fixture in light and dark, in all three views, and reports what
 * rendered (text, KaTeX, Mermaid, errors) plus how long huge.md took to open.
 * Usage: node scripts/checks/sweep.mjs [--shots <dir>] [--only gfm.md,math.md]
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { args, connect, fixture, reporter, wait, ROOT } from './lib.mjs';

const opts = args();
const names = opts.only
  ? String(opts.only).split(',')
  : readdirSync(join(ROOT, 'fixtures')).filter((f) => f.endsWith('.md'));
const app = await connect();
const r = reporter();

const theme0 = await app.js('return window.__mdv.settings.getState().appTheme;');
await app.js(`window.__sweepErrors = []; if (!window.__sweepHooked) { window.__sweepHooked = true;
  const orig = console.error; console.error = (...a) => { window.__sweepErrors.push(a.map(String).join(' ').slice(0, 160)); orig(...a); };
  addEventListener('error', (e) => window.__sweepErrors.push(String(e.message).slice(0, 160))); } return 1;`);

const stats = () =>
  app.js(`const p = document.querySelector('.preview-scroll .preview');
    return { chars: p?.innerText.length ?? 0, katex: p?.querySelectorAll('.katex').length ?? 0,
      katexErr: p?.querySelectorAll('.katex-error').length ?? 0,
      mermaid: p?.querySelectorAll('.mermaid-output svg').length ?? 0,
      mermaidErr: p?.querySelectorAll('.mermaid-error').length ?? 0,
      docError: window.__mdv.document.getState().error ?? null };`);

for (const theme of ['light', 'dark']) {
  await app.setting('appTheme', theme);
  for (const name of names) {
    await app.setting('viewMode', 'formatted');
    const t0 = Date.now();
    const ok = await app.open(fixture(name));
    // Wait for the (debounced, lazily loaded) render to settle.
    let s = await stats();
    for (let i = 0; i < 40; i++) {
      await wait(250);
      const next = await stats();
      if (next.chars > 0 && JSON.stringify(next) === JSON.stringify(s)) break;
      s = next;
    }
    const ms = Date.now() - t0;
    for (const mode of ['split', 'source', 'formatted']) {
      await app.setting('viewMode', mode);
      await wait(mode === 'formatted' ? 600 : 300);
    }
    const errors = await app.js(
      'const e = window.__sweepErrors; window.__sweepErrors = []; return e;',
    );
    const good = ok && s.chars > 0 && !s.docError && !s.katexErr && !errors.length;
    const detail =
      `chars=${s.chars} katex=${s.katex} mermaid=${s.mermaid} mermaidErr=${s.mermaidErr}` +
      (name === 'huge.md' ? ` open+render=${ms}ms` : '') +
      (s.docError ? ` error=${s.docError}` : '') +
      (errors.length ? ` console=${JSON.stringify(errors)}` : '');
    r.check(`${theme} ${name}`, good, detail);
    if (opts.shots)
      await app.shot(join(String(opts.shots), `${name.replace(/\.md$/, '')}-${theme}.png`));
  }
}

await app.setting('appTheme', theme0);
app.close();
r.done();
