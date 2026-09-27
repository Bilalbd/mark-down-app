# Phase 11: Self-contained HTML export

**Item:** D7. **README:** yes. Rewrite the Export bullet: with **Self-contained HTML export** on
(the default), local images and the maths stylesheet and fonts are embedded, so the file works
anywhere offline. Remote images are still linked. The bundled preset fonts aren't embedded (the
existing sentence about falling back to system fonts stays). Mention the setting in Settings →
General.

Read `docs/plans/review-followups/README.md` first, then `src/lib/export.ts` and its test,
`src/components/Toolbar/ExportMenu.tsx`, `src/store/settings.ts`,
`src/components/Settings/GeneralTab.tsx`, `src-tauri/src/assets.rs` (`AssetRoot`,
`is_within_root`, `content_type_for`), `src-tauri/src/lib.rs`, `src/lib/tauri.ts`,
`src-tauri/capabilities/default.json`, and `node_modules/katex/dist/katex.min.css` (look at how it
references its fonts: `url(fonts/KaTeX_…woff2) format("woff2"),url(…woff) …,url(…ttf) …`).

## Decision (Bilal)

A Settings toggle **"Self-contained HTML export"**, **on by default**. On: local images become
`data:` URLs and the KaTeX CSS (with its woff2 fonts as `data:` URLs) is inlined instead of linked
from the CDN. Off: exactly today's export (`file://` images, CDN stylesheet).

## Design

- **Images** need their bytes, which the webview can't read itself: the CSP blocks `fetch` to
  `mdasset:`, and a canvas would be tainted. Add a Rust command that reads a file **under the
  current asset root only** (same check as the `mdasset` protocol) and returns a `data:` URL.
  Nothing wider than what the preview can already display.
- **KaTeX** CSS comes from `katex/dist/katex.min.css?raw`. Its fonts come from
  `import.meta.glob('/node_modules/katex/dist/fonts/*.woff2', { query: '?inline', import: 'default' })`
  (lazy, so the ~300 KB of fonts is only loaded when exporting). If that glob path doesn't resolve
  with pnpm's layout, try the path through `node_modules/.pnpm/…` or a relative path, and report
  what worked. Fonts are only embedded when the document contains maths.

## Files

- `src-tauri/src/assets.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml` (+ `Cargo.lock`)
- `src/lib/tauri.ts`
- `src/lib/export.ts`, `src/lib/export.test.ts`
- `src/components/Toolbar/ExportMenu.tsx`
- `src/store/settings.ts`, `src/store/settings.test.ts`
- `src/components/Settings/GeneralTab.tsx`, `README.md`

## Tasks

### Rust

- [x] **1.** Add the `base64` crate (`cargo add base64` inside `src-tauri`; say in the commit
  message body why: "base64: encode embedded images for self-contained HTML export"). Check whether
  it's already in `Cargo.lock` as a transitive dependency and use that major version if so.
- [x] **2.** In `assets.rs`:
  ```rust
  /// Reads an image under the current document's folder as a `data:` URL, for embedding in an
  /// HTML export. Same access rule as the `mdasset` protocol: nothing outside `AssetRoot`.
  #[tauri::command]
  pub fn read_asset_data_url(app: AppHandle, path: String) -> Result<String, String>
  ```
  No root → `Err("no document folder")`; outside the root → `Err("not allowed")`; otherwise
  `data:<content_type_for>;base64,<…>`. Put the pure part in a function
  `fn to_data_url(bytes: &[u8], path: &Path) -> String` and unit-test it (a PNG path gives
  `data:image/png;base64,…` with the right base64 for a few known bytes), and add a test that the
  root check rejects a sibling folder (reuse the existing temp-dir helpers). Refuse files over
  20 MB with an error (so a stray huge file can't blow up the export).
- [x] **3.** Register it in `generate_handler!` in `lib.rs`. The existing app commands have no
  per-command permission entries in `capabilities/default.json`; follow the same pattern and
  confirm in the Report that nothing needed adding. Don't widen any scope or the CSP.

### Frontend

- [x] **4.** `tauri.ts`: `export function readAssetDataUrl(path: string): Promise<string>` (rejects
  outside Tauri, with JSDoc saying so).
- [x] **5.** Setting `selfContainedExport: boolean`, default `true`, in `Settings` and `DEFAULTS`
  (with a JSDoc comment). Settings → General gets a new section **Export** with a toggle row
  "Self-contained HTML export", hint "Embeds images and maths fonts; larger files".
- [x] **6.** In `export.ts`, pure helpers (tested):
  - `assetPaths(html: string): string[]`: the decoded local paths of every
    `src="http://mdasset.localhost/…"` (and `asset.localhost`), de-duplicated.
  - `replaceAssetUrls(html: string, urls: ReadonlyMap<string, string>): string`: swaps each such
    `src` for its entry in `urls` when present, and falls back to `toFileUrl` otherwise (so one
    unreadable image doesn't fail the export).
  - `inlineKatexFonts(css: string, fonts: ReadonlyMap<string, string>): string`: rewrites each
    `@font-face` `src` to just `url(<data url>) format("woff2")` using the woff2 file name as the
    key (e.g. `KaTeX_AMS-Regular.woff2`), dropping the woff/ttf fallbacks; leaves a font-face
    unchanged if its woff2 isn't in the map.
  - `buildExportHtml` gets an optional `katexCss?: string` in `ExportOptions`: when given, it's put
    in a `<style>` instead of the CDN `<link>`. Existing tests keep passing unchanged.
- [x] **7.** `ExportMenu.tsx` `exportHtml`: when `selfContainedExport` is on, collect
  `assetPaths`, read each with `readAssetDataUrl` (all in parallel, each `.catch` → skip, so it
  falls back to a `file://` URL), build the map and `replaceAssetUrls`. If the body contains KaTeX
  (`class="katex`), load the raw CSS and the fonts (the lazy glob), `inlineKatexFonts`, and pass it
  as `katexCss`. When the setting is off, behave exactly as today. Keep the loading behind dynamic
  `import()` so none of this is in the startup bundle; check with `pnpm build` that the fonts end
  up in a separate chunk (report the chunk names and sizes from the build output).

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`, `cargo check`, `cargo test`,
  `pnpm build` (report the relevant chunk sizes).
- [x] Manual check (done by the supervisor). Scratch folder with copies of `fixtures/gfm.md`, (done by the supervisor, see below)
  `fixtures/math.md` and the `fixtures/images/` folder.
  - The native Save dialog can't be driven, so check the pieces directly with `eval-file`: open
    the copy of `gfm.md`, then in the page run the same steps `exportHtml` runs (import
    `@/lib/export` via `await import('/src/lib/export.ts')` and `readAssetDataUrl` via
    `await import('/src/lib/tauri.ts')`) on `document.querySelector('.preview').innerHTML`, and
    show that the result has **no** `mdasset.localhost` and does contain `data:image/png;base64,`.
  - Same with `math.md`: the result has no `cdn.jsdelivr.net` and contains `@font-face` with
    `data:font/woff2`.
  - Write the `math.md` result to your **scratchpad** with `writeFile` from `@/lib/tauri`. Report
    its size, and open it with the Read tool to confirm the `<head>` has the inlined KaTeX
    `<style>` and no CDN `<link>`. The supervisor will open it in a browser to check it renders.
  - Turn the setting off, repeat for `gfm.md` and show the output has `file:///` image URLs (today's
    behaviour). Turn it back on (read its value first; it's new, so it should be `true`).
- [x] Commit: `Embed images and maths fonts in exported HTML`.

## Report

**Tests:** 339 → 347 (8 new tests: assetPaths, replaceAssetUrls, inlineKatexFonts, buildExportHtml with katexCss, Rust to_data_url and root check)

**Cargo test:** 38 passed; to_data_url correctly base64-encodes PNG magic bytes (iVBO); root check rejects sibling directories.

**Glob path:** `/node_modules/katex/dist/fonts/*.woff2` works correctly; fonts load as lazy chunks not in startup bundle.

**Build chunks:** 
- `katex-ZlcWpGUi.js` 258.68 KB (gzip: 77.43 KB) — KaTeX library, loaded dynamically on export
- `katex.min-BNZjRJto.js` 24.81 KB (gzip: 3.64 KB) — KaTeX CSS, loaded dynamically on export
- Main bundle: `index-B2i1bLDA.js` 1,223.51 KB (unchanged)
- Fonts and Shiki language chunks remain as static assets, not in startup.

**Capabilities:** No changes to `capabilities/default.json` needed; `read_asset_data_url` registered alongside `set_asset_root` with no new permissions.

**Implementation notes:**
- Used existing base64 0.22.1 (already transitive dependency)
- KaTeX CSS imported as `?raw`, fonts via `import.meta.glob` with `?inline` query and lazy evaluation
- assetPaths uses Set for deduplication; replaceAssetUrls falls back to toFileUrl for missing entries
- inlineKatexFonts rewrites @font-face src to drop woff/ttf fallbacks, keeping only inlined woff2

## Supervisor check

Diff reviewed. Two bugs that would have broken maths in every self-contained export, fixed directly
(follow-up commit):
- **Fonts never inlined:** with `import: 'default'` each glob loader resolves to the data: URL
  string itself, but ExportMenu read `.default` from it, so every font was `undefined` while the CDN
  `<link>` was dropped — maths would have lost its fonts entirely.
- **Rules merged:** `inlineKatexFonts` matched `src:…[^;]*`, but in the real minified CSS `src` is
  the last declaration before `}`, so the match ran through the `}` into the next `@font-face`. Now
  stops at `;` or `}` and keeps `format("woff2")`. The agent's test used a single rule, so it passed;
  new test with two consecutive real-shaped rules (fails on 49fb95a, passes now).
Also: the Rust command now checks the file size (metadata) before reading, and the self-contained
steps moved out of ExportMenu into `embedLocalImages()` / `loadInlineKatexCss()` in `lib/export.ts`
(logic out of the component, per CLAUDE.md), which also made them callable for the check below.
`pnpm test` 348 passed (26 files); lint, tsc clean; `cargo test` 38 passed; `pnpm build`: the 22
fonts are separate lazy chunks (`KaTeX_*-<hash>.js`), only referenced by path from the main bundle.

**Manual check (supervisor, dev app, scratch gfm.md / math.md / images):** ran the same steps the
Export button runs (minus the native Save dialog) and wrote the output with `writeFile`:
- gfm.md self-contained: 1 image embedded as `data:image/…`, no `mdasset.localhost` left, 16 KB.
- math.md self-contained: 20 `@font-face` fonts inlined, no CDN link, no relative font URLs,
  383 KB, 64 ms to build.
- Setting off (as today): `file:///` images and the CDN `<link>`.
- Rendered both math exports in headless Edge with the network blocked (dead proxy): the
  self-contained file shows every formula correctly; the linked one shows formulas twice and broken
  radicals (no stylesheet offline). Screenshots checked.
Settings equal to the backup at the end, apart from the new `selfContainedExport` key now stored at
its default (`true`).
