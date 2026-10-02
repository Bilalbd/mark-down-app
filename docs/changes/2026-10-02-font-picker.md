# A font picker with built-in, installed and Google fonts

**Date:** 2026-10-02 · **Type:** Added

**Why:** The Body, Heading and Code font settings were free-text boxes, so you had to know a font's
exact name, and only a few fonts worked on every PC. People wanted to see and pick fonts, including
Arabic ones, and still have documents look right offline and in exports.

**What changed:** Each font setting is now a searchable picker, with every font shown in its own
typeface (`src/components/Settings/FontPicker.tsx`).
- **Three sources:** *Built in* (19 fonts bundled with the app), *On this PC* (installed fonts) and
  *Google Fonts* (about 1,950 after de-duplication). A font that is built in or installed is listed
  once, under its own group. The Code font lists monospace fonts only, a *Supports Arabic* filter
  narrows any list, Heading has a *Same as body* row, and *Custom CSS font list…* switches to the
  old free-text box.
- **Download once:** picking a Google font that isn't on disk downloads it (progress as
  *Downloading… 3/12*) into `%APPDATA%\com.bilal.markdown-viewer\fonts\`, then applies it. The
  catalogue (`catalog.json`, cached 7 days) is fetched only when a picker opens. Downloaded fonts
  are listed in Settings with a *Remove* button (`DownloadedFonts.tsx`); importing a preset that uses
  Google fonts offers to download them all in one prompt, and offline it doesn't prompt. Fonts the
  active preset uses are loaded before the window appears. The Rust side is
  `src-tauri/src/google_fonts.rs`; the catalogue and the downloaded list live in the session-only
  `fonts` store (`src/store/fonts.ts`).
- **Network and CSP:** only `api.fontsource.org` and `cdn.jsdelivr.net`, and only when you open the
  Google Fonts list, download a font or import such a preset. Never Google itself. All downloading
  happens in Rust (`google_fonts.rs`), and the page loads a downloaded font from bytes Rust reads
  (`new FontFace(name, bytes)` in `src/lib/fontLoader.ts`), so the webview's CSP is unchanged.
- **Export:** self-contained HTML export embeds the built-in and downloaded Google fonts that the
  preset's body, heading and code stacks use, as data URLs (`src/lib/exportFonts.ts`). Installed
  fonts are never embedded, because their licences usually forbid it.

**Verified:** unit tests (886 tests in 57 files) and the running-app checks in
`scripts/checks/fonts.mjs` and `scripts/checks/fonts-google.mjs`.
- **Batch A:** all 19 built-in fonts load only their Latin, Latin-ext and (Arabic fonts) Arabic
  files and render, in light and dark. Opening `huge.md` took 1.09–1.20 s, against 1.05–1.11 s on
  main.
- **Batch B:** 21 picker checks per theme pass, and all 9 built-in presets show their fonts.
- **Batch C:** download with progress; registered before app-ready after a restart; offline with and
  without a cached catalogue (simulated with an unreachable `HTTPS_PROXY`); remove, re-download and
  the import prompt.
- **Batch D:** with Lora (built in) as body, Literata (downloaded) as heading and Cascadia Code
  (installed) as code font, the self-contained export embeds 8 faces, Lora's and Literata's only,
  as data URLs (427 KB). Opened from a local server, it renders in those fonts with no network
  requests at all; the code falls back. With self-contained export off the file has no
  `@font-face` (19 KB). In a production build (`pnpm build`), the built-in fonts' rules point at
  the hashed `/assets/*.woff2` files, which fetch as WOFF2. Opening Fonts & colours no longer
  fetches the catalogue; opening a picker does. The full fixture sweep (`huge.md` 1.05–1.18 s) and
  the keys, menus, guide, settings and font checks pass.

**Notes:** Only Latin, Latin Extended and Arabic files are downloaded or bundled, so other scripts
use a system font. Bundling the 19 fonts grew `dist` from 17.8 MB to 20.6 MB (font files 0.86 to
3.57 MB) and the installer from 6.58 MB to 9.32 MB.
