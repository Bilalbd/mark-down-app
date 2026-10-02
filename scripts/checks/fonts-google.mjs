/**
 * Google Fonts checks (with fonts.mjs). Each step expects the app in a particular state, so a run
 * goes step by step with restarts in between (README → Development):
 *   download        online: browse the Google group, download and apply Literata with progress,
 *                   filters, the Downloaded fonts section (light and dark)
 *   restart         after a relaunch: Literata is registered at startup and still applied
 *   offline         launched with HTTPS_PROXY pointing nowhere, catalogue cached: the list still
 *                   loads, a download fails inline and leaves nothing behind
 *   offline-nocache offline with catalog.json deleted: the "needs an internet connection" row,
 *                   downloaded fonts still work, importing a preset doesn't prompt
 *   remove          online: removing an unused font asks nothing; removing the preset's font asks,
 *                   falls back at once, and downloading it again brings it back
 *   import          online: importing a preset whose fonts are only in the Google catalogue offers
 *                   one download for all of them ("Not now", then "Download")
 *   export          online: with Lora (built in), Literata (downloaded) and Cascadia Code
 *                   (installed), builds the HTML export as the Export menu does (self-contained on
 *                   and off) into --out <dir>, and checks which fonts each file embeds
 *   cleanup         removes every downloaded font
 * Picking fonts edits the active preset; stop.ps1 puts presets.json back. The fonts\ folder in the
 * app's data isn't backed up: run `cleanup`, and delete the folder if it didn't exist before.
 * Usage: node scripts/checks/fonts-google.mjs --step <name> [--shots <dir>] [--out <dir>]
 */
import { join } from 'node:path';
import { args, connect, fixture, reporter, wait } from './lib.mjs';

const opts = args();
const step = String(opts.step ?? '');
const app = await connect();
const r = reporter();
const theme0 = await app.js('return window.__mdv.settings.getState().appTheme;');

const STORE = `const { useFontsStore } = await import('/src/store/fonts.ts');`;
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
const shot = (name) =>
  opts.shots ? app.shot(join(String(opts.shots), `google-${name}.png`)) : null;
/** Polls `body` (a page function body returning a value) until `ok(value)`, up to `ms`. */
const until = async (body, ok, ms = 20000) => {
  let v;
  for (const t0 = Date.now(); Date.now() - t0 < ms; await wait(150)) {
    v = await app.js(body);
    if (ok(v)) return v;
  }
  return v;
};
const popover = () =>
  app.js(`const p = document.querySelector('.font-picker__popover'); if (!p) return null;
    const rows = [...p.querySelectorAll('[role=option]:not(.is-action)')];
    return {
      groups: [...p.querySelectorAll('.font-picker__group')].map((g) => g.textContent.trim()),
      notes: [...p.querySelectorAll('.font-picker__empty')].map((n) => n.textContent.trim()),
      more: [...p.querySelectorAll('[role=option].is-action')].map((o) => o.textContent.trim()),
      rows: rows.map((o) => ({ name: o.querySelector('.font-picker__row-name')?.textContent,
        tag: o.querySelector('.font-picker__row-tag')?.textContent ?? '',
        styled: !!o.querySelector('.font-picker__row-name')?.style.fontFamily,
        error: o.querySelector('.font-picker__row-error')?.textContent ?? null })),
    };`);
const openFontsPage = async () => {
  if (!(await app.js(`return !!document.querySelector('.settings');`)))
    await app.click('[aria-label="Settings"]');
  await wait(400);
  await app.click('.settings [role=tab]', 'Appearance');
  await wait(300);
  await app.click('.settings [role=tabpanel] button', 'Fonts & colours');
  await wait(500);
};
const closeSettings = async () => {
  if (await app.js(`return !!document.querySelector('.settings');`))
    await app.click('[aria-label="Settings"]');
  await wait(300);
};
/** Whether text in `family` measures differently from its fallback, so the font itself is used. */
const renders = (family) =>
  app.js(`const ctx = document.createElement('canvas').getContext('2d');
    const w = (f) => { ctx.font = '32px ' + f; return ctx.measureText('Hamburgefonstiv 0123').width; };
    return w("'${family}', monospace") !== w('monospace');`);
const faces = (family) =>
  app.js(
    `return [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === ${JSON.stringify(family)} && f.status === 'loaded').length;`,
  );
const previewBody = () =>
  app.js(`const e = document.querySelector('.preview-scroll .preview p');
    return e ? getComputedStyle(e).fontFamily : null;`);
const downloadedSection = () =>
  app.js(
    `return [...document.querySelectorAll('.downloaded-fonts__name')].map((e) => e.textContent);`,
  );
const dialog = () =>
  app.js(`const d = document.querySelector('.dialog'); if (!d) return null;
    return { title: d.querySelector('.dialog__title')?.textContent,
      buttons: [...d.querySelectorAll('.dialog__btn')].map((b) => b.textContent.trim()) };`);
const searchPicker = async (label, query) => {
  if (!(await app.js(`return !!document.querySelector('.font-picker__popover');`)))
    await clickSel(btn(label));
  await app.press('ctrl+a');
  await app.press('Backspace');
  if (query) await typeText(query);
  return popover();
};
/** Clicks the first font row whose name is `name`. */
const clickRow = (name) =>
  app
    .js(
      `const row = [...document.querySelectorAll('.font-picker__popover [role=option]:not(.is-action)')]
      .find((o) => o.querySelector('.font-picker__row-name')?.textContent === ${JSON.stringify(name)});
    if (!row) return null; row.scrollIntoView({ block: 'nearest' }); const r = row.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`,
    )
    .then(async (c) => c && (await app.mouse(c.x, c.y), true));
/** Downloads `name` from the picker, sampling the progress label. Returns the samples. */
const pickAndDownload = async (label, name) => {
  await searchPicker(label, name);
  await clickRow(name);
  const samples = new Set();
  for (const t0 = Date.now(); Date.now() - t0 < 30000; await wait(100)) {
    const s = await app.js(`const p = document.querySelector('.font-picker__popover');
      if (!p) return { closed: true };
      return { tag: [...p.querySelectorAll('.font-picker__row-tag')].map((t) => t.textContent).find((t) => t.startsWith('Downloading')) ?? null,
        error: p.querySelector('.font-picker__row-error')?.textContent ?? null };`);
    if (s.tag) samples.add(s.tag);
    if (s.closed || s.error) return { samples: [...samples], ...s };
  }
  return { samples: [...samples], timeout: true };
};

await app.setting('viewMode', 'formatted');
await app.open(fixture('gfm.md'));

if (step === 'download') {
  for (const theme of ['light', 'dark']) {
    await app.setting('appTheme', theme);
    await openFontsPage();
    await clickSel(btn('Body font'));
    const p = await until(
      `return document.querySelector('.font-picker__popover')?.textContent.includes('Loading Google Fonts') === false;`,
      Boolean,
    ).then(popover);
    r.check(
      `${theme} Google group loads`,
      p.groups.includes('Google Fonts') && p.more.some((m) => /^Show all \(\d{4}\)$/.test(m)),
      `groups=${p.groups.join(' | ')} more=${p.more.join(' | ')}`,
    );
    if (theme === 'light') {
      const pd = await pickAndDownload('Body font', 'Literata');
      await wait(500);
      r.check(
        'download Literata with progress, then apply',
        pd.closed && pd.samples.length > 0 && !pd.error,
        `progress=${pd.samples.join(', ')}${pd.error ? ` error=${pd.error}` : ''}`,
      );
      r.check(
        'Literata in the preview',
        (await labelOf('Body font'))?.startsWith('Body font: Literata, Google Fonts') &&
          (await previewBody())?.includes('Literata') &&
          (await faces('Literata')) > 0 &&
          (await renders('Literata')),
        `${await labelOf('Body font')} / ${await previewBody()} / faces=${await faces('Literata')}`,
      );
    }
    const again = await searchPicker('Body font', 'literata');
    const lit = again.rows.find((x) => x.name === 'Literata');
    r.check(
      `${theme} Literata listed as downloaded, in its own face`,
      lit?.tag.includes('Downloaded') && lit.styled,
      JSON.stringify(lit),
    );
    await searchPicker('Body font', '');
    await shot(`picker-${theme}`);
    const amiri = await searchPicker('Body font', 'amiri');
    await clickSel('.font-picker__filter input');
    const amiriArabic = await popover();
    await clickSel('.font-picker__filter input');
    r.check(
      `${theme} Supports Arabic includes Google fonts`,
      amiriArabic.rows.some((x) => x.name === 'Amiri') &&
        amiri.rows.some((x) => x.name === 'Amiri'),
      amiriArabic.rows.map((x) => x.name).join(', '),
    );
    await app.press('Escape');
    const mono = await searchPicker('Code font', 'space mono');
    r.check(
      `${theme} Code font lists Google monospace fonts`,
      mono.rows.some((x) => x.name === 'Space Mono' && x.tag.startsWith('Mono')),
      JSON.stringify(mono.rows),
    );
    await app.press('Escape');
    const list = await downloadedSection();
    r.check(`${theme} Downloaded fonts section`, list.includes('Literata'), list.join(', '));
    await app.js(
      `document.querySelector('.downloaded-fonts')?.scrollIntoView({ block: 'center' }); return 1;`,
    );
    await shot(`downloaded-${theme}`);
    await closeSettings();
    await shot(`preview-${theme}`);
  }
} else if (step === 'restart') {
  r.check(
    'Literata registered at startup and applied',
    (await faces('Literata')) > 0 &&
      (await previewBody())?.includes('Literata') &&
      (await renders('Literata')),
    `faces=${await faces('Literata')} preview=${await previewBody()}`,
  );
  await shot('restart');
  const catalog = await app.js(`${STORE} return useFontsStore.getState().catalogStatus;`);
  r.check('no catalogue fetch at startup', catalog === 'idle', `catalogStatus=${catalog}`);
  // Opening Settings, even on a preset naming an unknown font, doesn't fetch it either; only
  // opening a picker does.
  await app.js(`window.__mdv.style.getState().updateActive((p) => ({ ...p, typography: { ...p.typography,
      headingFont: 'Charter, Georgia, serif' } })); return 1;`);
  await openFontsPage();
  await wait(1500);
  const onSettings = await app.js(`${STORE} return useFontsStore.getState().catalogStatus;`);
  const heading = await labelOf('Heading font');
  r.check(
    'opening Fonts & colours fetches nothing',
    onSettings === 'idle' && heading === 'Heading font: Charter',
    `catalogStatus=${onSettings} label=${heading}`,
  );
  await clickSel(btn('Heading font'));
  await until(`${STORE} return useFontsStore.getState().catalogStatus;`, (s) => s === 'ready');
  await app.press('Escape');
  r.check(
    'opening a picker fetches it, then the note appears',
    (await labelOf('Heading font')) === 'Heading font: Charter, Not installed',
    String(await labelOf('Heading font')),
  );
  await closeSettings();
} else if (step === 'offline') {
  await openFontsPage();
  await clickSel(btn('Body font'));
  const p = await until(
    `return document.querySelector('.font-picker__popover')?.textContent.includes('Loading Google Fonts') === false;`,
    Boolean,
  ).then(popover);
  r.check(
    'cached catalogue loads offline',
    p.groups.includes('Google Fonts') && p.more.some((m) => /^Show all \(\d{4}\)$/.test(m)),
    `groups=${p.groups.join(' | ')} notes=${p.notes.join(' | ')}`,
  );
  const pd = await pickAndDownload('Body font', 'Crimson Pro');
  r.check(
    'offline download fails inline, list stays open',
    !pd.closed && /internet|reach/i.test(pd.error ?? ''),
    `error=${pd.error} progress=${pd.samples.join(', ')}`,
  );
  await shot('offline-error');
  await app.press('Escape');
  const left = await app.js(
    `${STORE} return (await useFontsStore.getState().loadDownloaded()).map((f) => f.id);`,
  );
  r.check('nothing left behind', !left.includes('crimson-pro'), `downloaded=${left.join(', ')}`);
  await closeSettings();
} else if (step === 'offline-nocache') {
  await openFontsPage();
  await clickSel(btn('Body font'));
  const p = await until(
    `return document.querySelector('.font-picker__popover')?.textContent.includes('Needs an internet connection');`,
    Boolean,
    8000,
  ).then(popover);
  r.check(
    'offline with no catalogue says so',
    p.notes.includes('Needs an internet connection to add Google fonts') &&
      p.groups.includes('Built in'),
    `groups=${p.groups.join(' | ')} notes=${p.notes.join(' | ')}`,
  );
  await shot('offline-nocache');
  await app.press('Escape');
  const list = await downloadedSection();
  r.check(
    'downloaded fonts still listed and applied offline',
    list.includes('Literata') && (await renders('Literata')),
    list.join(', '),
  );
  const asked =
    await app.js(`const { offerGoogleFonts } = await import('/src/components/Settings/importFonts.ts');
    const r = await offerGoogleFonts(["'Crimson Pro', Georgia, serif", '', 'monospace'], () => undefined);
    return { result: r, dialog: !!document.querySelector('.dialog') };`);
  r.check(
    'import offline: no prompt',
    asked.result === null && !asked.dialog,
    JSON.stringify(asked),
  );
  await closeSettings();
} else if (step === 'remove') {
  await app.js(`${STORE} await useFontsStore.getState().download('lobster'); return 1;`);
  await openFontsPage();
  await until(`return document.querySelectorAll('.downloaded-fonts__name').length;`, (n) => n >= 2);
  await clickSel('[aria-label="Remove Lobster"]');
  await wait(800);
  const noDialog = !(await dialog());
  r.check(
    'removing an unused font asks nothing',
    noDialog && !(await downloadedSection()).includes('Lobster'),
    (await downloadedSection()).join(', '),
  );
  await clickSel('[aria-label="Remove Literata"]');
  await wait(400);
  const d = await dialog();
  await shot('remove-confirm');
  await app.click('.dialog__btn', 'Remove');
  await wait(800);
  const label = await labelOf('Body font');
  r.check(
    'removing the preset font asks, then falls back at once',
    d?.title === 'Remove Literata?' &&
      (await faces('Literata')) === 0 &&
      !(await renders('Literata')) &&
      label?.includes('not downloaded'),
    `dialog=${JSON.stringify(d)} label=${label} faces=${await faces('Literata')}`,
  );
  const pd = await pickAndDownload('Body font', 'Literata');
  await wait(500);
  r.check(
    'downloading it again brings it back',
    pd.closed && (await faces('Literata')) > 0 && (await renders('Literata')),
    `progress=${pd.samples.join(', ')} faces=${await faces('Literata')}`,
  );
  await closeSettings();
} else if (step === 'import') {
  const style0 = await app.js(`const s = window.__mdv.style.getState();
    return JSON.stringify({ presets: s.presets, activePresetId: s.activePresetId });`);
  await app.js(
    `${STORE} await useFontsStore.getState().remove('literata').catch(() => undefined); return 1;`,
  );
  const json = await app.js(`const s = window.__mdv.style.getState();
    const p = JSON.parse(s.exportPreset(s.activePresetId));
    p.name = 'Font import check';
    p.typography.bodyFont = "'Literata', Georgia, serif";
    p.typography.headingFont = "'Crimson Pro', Georgia, serif";
    return JSON.stringify(p);`);
  const runImport = (choice) =>
    app.js(`const { offerGoogleFonts } = await import('/src/components/Settings/importFonts.ts');
      const s = window.__mdv.style.getState(); const res = s.importPreset(${JSON.stringify(json)});
      if (!res.ok) return { error: res.error };
      const t = window.__mdv.style.getState().presets.find((p) => p.id === res.id).typography;
      const status = [];
      const done = offerGoogleFonts([t.bodyFont, t.headingFont, t.monoFont], (x) => status.push(x));
      let d = null;
      for (let i = 0; i < 100 && !d; i++) { await new Promise((r) => setTimeout(r, 100)); d = document.querySelector('.dialog'); }
      const title = d?.querySelector('.dialog__title')?.textContent ?? null;
      [...(d?.querySelectorAll('.dialog__btn') ?? [])].find((b) => b.textContent.trim() === ${JSON.stringify(choice)})?.click();
      const result = await done;
      return { title, result, status };`);
  const later = await runImport('Not now');
  const afterLater = await app.js(
    `${STORE} return useFontsStore.getState().downloaded.map((f) => f.id);`,
  );
  r.check(
    'import offers one download for all its Google fonts; "Not now" downloads nothing',
    later.title === 'Download Literata and Crimson Pro?' &&
      later.result === null &&
      !afterLater.includes('literata'),
    JSON.stringify(later),
  );
  const yes = await runImport('Download');
  const afterYes = await app.js(
    `${STORE} return useFontsStore.getState().downloaded.map((f) => f.id);`,
  );
  r.check(
    '"Download" fetches them all, with progress',
    yes.result === 'Downloaded Literata and Crimson Pro.' &&
      afterYes.includes('literata') &&
      afterYes.includes('crimson-pro') &&
      yes.status.some((s) => /\d+\/\d+$/.test(s)),
    `${yes.result} / status=${yes.status.slice(0, 3).join(' | ')}…`,
  );
  await wait(500);
  r.check(
    'imported preset renders in Literata',
    (await previewBody())?.includes('Literata') && (await renders('Literata')),
    String(await previewBody()),
  );
  await shot('import');
  await app.js(`window.__mdv.style.setState(${style0}); return 1;`);
} else if (step === 'export') {
  // Body: a built-in font, headings: a downloaded Google font, code: an installed font. Exports
  // through the real menu, answering the save dialog with a path under --out.
  const out = String(opts.out ?? '');
  if (!out) throw new Error('--out <dir> is required for the export step');
  const style0 = await app.js(`const s = window.__mdv.style.getState();
    return JSON.stringify({ presets: s.presets, activePresetId: s.activePresetId });`);
  const self0 = await app.js('return window.__mdv.settings.getState().selfContainedExport;');
  await app.js(`${STORE} await useFontsStore.getState().download('literata'); return 1;`);
  await app.js(`window.__mdv.style.getState().updateActive((p) => ({ ...p, typography: { ...p.typography,
      bodyFont: "'Lora Variable', Georgia, serif", headingFont: "'Literata', Georgia, serif",
      monoFont: "'Cascadia Code', Consolas, monospace" } })); return 1;`);
  await wait(800);
  // The same steps as ExportMenu's exportHtml up to the save dialog, which a check can't answer
  // (`__TAURI_INTERNALS__.invoke` is read-only, and the dialog's controls aren't reachable).
  const exportTo = async (file, selfContained) => {
    const html = await app.js(`const ex = await import('/src/lib/export.ts');
      const { loadFontCss } = await import('/src/lib/exportFonts.ts');
      const preset = window.__mdv.style.getState().active();
      const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      let bodyHtml = ex.stripCursorMark(document.querySelector('.preview-scroll .preview').innerHTML);
      let katexCss, fontCss;
      if (${selfContained}) {
        bodyHtml = await ex.embedLocalImages(bodyHtml);
        if (bodyHtml.includes('class="katex')) katexCss = await ex.loadInlineKatexCss();
        fontCss = await loadFontCss(preset);
      }
      return ex.buildExportHtml({ title: 'gfm', bodyHtml, preset, theme, katexCss, fontCss });`);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(out, file), html);
  };
  await exportTo('export-self-contained.html', true);
  await exportTo('export-linked.html', false);
  const { readFileSync } = await import('node:fs');
  const faces = (html) =>
    [...html.matchAll(/@font-face\{font-family:'([^']+)'[^}]*src:url\((data:[^)]{0,30})/g)].map(
      (m) => `${m[1]}|${m[2].slice(0, 22)}`,
    );
  const a = readFileSync(join(out, 'export-self-contained.html'), 'utf8');
  const b = readFileSync(join(out, 'export-linked.html'), 'utf8');
  const fa = faces(a);
  const families = [...new Set(fa.map((f) => f.split('|')[0]))].sort();
  r.check(
    'self-contained export embeds Lora and Literata only, as data URLs',
    a.includes('/* fonts */') &&
      families.join() === 'Literata,Lora Variable' &&
      fa.every((f) => f.includes('data:font/woff2;base64')),
    `${fa.length} faces: ${families.join(', ')}; ${Math.round(a.length / 1024)} KB`,
  );
  r.check(
    'export with self-contained off has no embedded fonts',
    !b.includes('@font-face') && !b.includes('/* fonts */'),
    `${Math.round(b.length / 1024)} KB`,
  );
  await app.setting('selfContainedExport', self0);
  await app.js(`window.__mdv.style.setState(${style0}); return 1;`);
} else if (step === 'cleanup') {
  const ids = await app.js(
    `${STORE} const list = await useFontsStore.getState().loadDownloaded();
    for (const f of list) await useFontsStore.getState().remove(f.id);
    return list.map((f) => f.id);`,
  );
  r.check('removed downloaded fonts', true, ids.join(', ') || 'none');
} else {
  throw new Error(`Unknown --step "${step}"`);
}

await app.setting('appTheme', theme0);
app.close();
r.done();
