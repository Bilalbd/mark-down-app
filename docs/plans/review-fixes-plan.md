# Implementation plan: code-review fixes and improvements

**Audience:** an AI coding agent (Claude Sonnet 5) working in a fresh session with no prior context.
**Repo:** `C:\Claude Projects\mark-down-app` (a Windows Markdown viewer/editor).
**Goal:** fix every issue found in the 25 Sep 2026 code review and ship the suggested improvements, one phase per commit, with tests.

Read this whole document before starting. Work through the phases **in order**. Each phase has a
**Verify** step that must pass before you commit it.

---

## 0. Context you need

### Stack
- **Tauri 2** (Rust backend in `src-tauri/`) + **React 19** + **TypeScript** + **Vite 8**, package manager **pnpm**.
- Editor: **CodeMirror 6** (`src/components/Editor/SourceEditor.tsx`).
- Rendering: **markdown-it** + Shiki + KaTeX + Mermaid, sanitised by DOMPurify (`src/markdown/`).
- State: **zustand** stores in `src/store/` (`document.ts`, `settings.ts`, `style.ts`, `view.ts`).
- Tests: **vitest** + jsdom, files named `src/**/*.test.ts(x)`.

### Commands (run from the repo root, PowerShell)
```powershell
pnpm test                 # vitest run (must stay green)
pnpm lint                 # eslint src (must be clean)
npx tsc --noEmit          # typecheck (must be clean)
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
cd src-tauri; cargo check; cargo test; cd ..   # Rust (needed for Phases 1, 5 and 9)
```
Manual app testing: `.\scripts\dev.ps1 path\to\file.md` starts the dev app with WebView2 remote
debugging on port 9222. `node scripts/cdp.mjs eval "<js>"`, `eval-file <file.js>`,
`screenshot <out.png>` and `pdf <out.pdf>` drive the real window. Dev builds expose
`window.__mdv` (`document`, `settings`, `view`, `style` stores, plus `render`).

### Machine quirks (important)
- The **Bash tool collapses `\\` to `\`** on this machine. Write anything that contains backslashes
  (regexes, Windows paths, TeX) with the **Write/Edit tools**, not heredocs or `sed`.
- `.gitattributes` has `* text=auto eol=lf`. Any fixture that must keep CRLF line endings needs its
  own `-text` rule (see Phase 1).

### Decisions already made (do NOT change or re-discuss)
Single file per window; Formatted / Source / Split views; presets with light and dark colour sets
plus custom CSS; NSIS installer with `.md` association. Explicitly **out of scope**: Obsidian syntax
(callouts, wikilinks, `==highlight==`), tabs or a folder browser, autosave.

### Conventions
- Match the surrounding style: 2-space indent, single quotes, Prettier config in `.prettierrc`
  (run `pnpm format` on touched files), short JSDoc comments on exported helpers, `@/` import alias.
- Commit messages: imperative, sentence case, no prefix (e.g. `Preserve CRLF line endings on save`).
  End every commit message with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- Work on a new branch: `git switch -c fix/review-findings` (from the current branch). Do not push or
  open a PR unless the user asks.
- If a step turns out much harder than described (e.g. a Tauri API differs from what's written
  here), do the smallest correct thing, leave a `// TODO(review):` note, and report it at the end.
  Don't silently skip anything.

---

## Phase 1: Data-safety bugs (highest priority)

### 1.1 CRLF files become "unsaved" and get converted to LF
**Cause:** CodeMirror always returns text joined with `\n`. `document.ts` stores the raw file text
(which may contain `\r\n`), so as soon as Source view mounts, the editor's content-sync effect
dispatches a replacement, the update listener calls `setContent` with LF text, and
`content !== savedContent`. (Verified with `@codemirror/state`: `EditorState.create({doc:'a\r\nb'}).doc.toString() === 'a\nb'`.)

**Fix: normalise to LF in memory and restore the original ending on save.**
1. Create `src/lib/eol.ts`:
   ```ts
   export type Eol = '\n' | '\r\n';

   /** Converts any mix of CRLF / CR / LF to LF and reports the file's dominant line ending. */
   export function normalizeEol(text: string): { text: string; eol: Eol } {
     const crlf = (text.match(/\r\n/g) ?? []).length;
     const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
     return { text: text.replace(/\r\n?/g, '\n'), eol: crlf > lf ? '\r\n' : '\n' };
   }

   /** Re-applies `eol` to LF-normalised text for writing to disk. */
   export function applyEol(text: string, eol: Eol): string {
     return eol === '\n' ? text : text.replace(/\n/g, eol);
   }
   ```
   (Write this with the Write tool because of the backslashes.)
2. `src/store/document.ts`: add `eol: Eol` to `DocumentState` (default `'\n'`).
   - `open`, `reload` and the browser fallback in `openWithDialog`: run `normalizeEol` on the
     file's content and store both `content`/`savedContent` (normalised) and `eol`.
   - `save` / `saveAs`: `writeFile(path, applyEol(content, eol))`. `savedContent` stays the
     normalised text.
   - `newDocument`: `eol: '\n'`.
3. Tests `src/lib/eol.test.ts`: pure LF, pure CRLF, mixed (dominant wins), lone `\r`, round trip
   `applyEol(normalizeEol(x).text, eol)` for a pure-CRLF input returns `x`.
4. Fixture: add `fixtures/crlf.md` with CRLF endings and add the line `fixtures/crlf.md -text` to
   `.gitattributes`. Create it with PowerShell so the CRLF endings survive:
   `Set-Content -NoNewline fixtures/crlf.md "# CRLF`r`n`r`nLine one`r`nLine two`r`n"`.
   Check with `git diff --stat` or `Format-Hex` that the `\r\n` pairs are there.

### 1.2 Clicking a relative link navigates the whole app away (loses unsaved work)
**Cause:** `Preview.tsx` `onClick` only intercepts `#…`, `http(s):` and `mailto:`. A link such as
`[x](other.md)` makes WebView2 navigate the app's own window, which reloads the app with no
unsaved-changes prompt.

**Fix, two layers:**
1. **Frontend** (`src/components/Preview/Preview.tsx`): rewrite `onClick` so that **every** anchor
   click is handled and `e.preventDefault()` is always called when `href` is present:
   - `#frag` → existing in-page scroll, but wrap `decodeURIComponent` in `try/catch` (fall back to
     the raw fragment).
   - `http:`, `https:`, `mailto:` → `openUrl` (existing behaviour).
   - Any other scheme (`asset:`, `file:`, `javascript:`, `http://asset.localhost`, etc.) → do
     nothing.
   - Relative path → resolve it against `dirname(path)` (strip `?query` and `#fragment` first and
     decode with `safeDecodeURI`, see 1.3). If the target's extension is `.md`, `.markdown`,
     `.mdown`, `.mkd` or `.txt`, call `useDocumentStore.getState().open(abs)` (it already asks
     about unsaved changes). Otherwise call `revealItemInDir(abs)` from
     `@tauri-apps/plugin-opener` (allowed by `opener:default`, so no capability change is needed).
     If there is no `path` (untitled document), do nothing.
   - Add `onAuxClick` that calls `preventDefault()` on anchors (middle-click opens a new window
     otherwise).
   - Put the path-joining helper in one place: move `joinPath` from `src/markdown/render.ts` to
     `src/lib/tauri.ts` (next to `dirname`/`basename`), export it, and use it in both places.
   - Put the "what to do with this href" decision in a pure, exported function
     (e.g. `classifyLink(href, docPath): {kind:'anchor'|'external'|'markdown'|'file'|'ignore', …}`
     in `src/lib/links.ts`) so it can be unit-tested; keep the side effects in the component.
2. **Backend guard** (`src-tauri/src/lib.rs`): block any top-level navigation away from the app as
   a safety net:
   ```rust
   fn is_app_url(url: &tauri::Url) -> bool {
       match url.scheme() {
           "tauri" => true,
           "http" | "https" => match url.host_str() {
               Some("tauri.localhost") => true,
               Some("localhost") => cfg!(debug_assertions), // Vite dev server
               _ => false,
           },
           "about" => true,
           _ => false,
       }
   }
   // in run():
   .plugin(
       tauri::plugin::Builder::new("navigation-guard")
           .on_navigation(|_webview, url| is_app_url(url))
           .build(),
   )
   ```
   If type inference complains, write `tauri::plugin::Builder::<tauri::Wry, ()>::new(...)`.
   Add a `#[cfg(test)]` unit test for `is_app_url`.
3. Tests `src/lib/links.test.ts` covering each kind, including `other.md#section`,
   `sub%20dir/a.md`, `../x.png`, `javascript:alert(1)` and `#bad%zz`.
4. Fixture: `fixtures/links.md` containing a relative `.md` link (to `gfm.md`), a relative image
   link, an external link and an in-page anchor.

### 1.3 Images with spaces or non-ASCII names don't load
**Cause:** markdown-it percent-encodes link destinations (`café.png` → `caf%C3%A9.png`,
`<my image.png>` → `my%20image.png`). `render.ts` joins that encoded string to the directory, and
`convertFileSrc` then encodes it again (`%2520`).

**Fix** (`src/markdown/render.ts`, image rule): before `joinPath`, strip `?query`/`#hash` and
decode:
```ts
/** decodeURI that never throws (malformed escapes are left as-is). */
export function safeDecodeURI(s: string): string {
  try { return decodeURI(s); } catch { return s; }
}
```
Put `safeDecodeURI` in `src/lib/tauri.ts` (or `links.ts`) and reuse it in 1.2.

Tests in `src/markdown/render.test.ts`: `![a](<my image.png>)` and `![b](café.png)` must call
`toAssetUrl` with `C:\docs\notes\my image.png` / `C:\docs\notes\café.png` (follow the existing
test at "resolves relative image paths"). Add `fixtures/images/my image.png` (a copy of
`sample.png`) and reference it from `fixtures/gfm.md` or `links.md`.

### 1.4 Undo can bring back the previous file; undo history is lost when switching views
**Cause:** (a) in `SourceEditor.tsx` the `[content]` effect replaces the whole document with a
normal, undoable transaction when a new file opens or the file reloads. (b) The editor is destroyed
on every Ctrl+E and on every split-pane swap, so undo history is lost.

**Fix:**
1. `src/store/document.ts`: add `loadId: number`, incremented by `open`, `newDocument`, `reload`
   and the browser-fallback open (not by `setContent`, `save` or `saveAs`).
2. `SourceEditor.tsx`:
   - Move the extension list into a function `buildExtensions()` and add
     `createEditorState(doc: string) => EditorState.create({ doc, extensions: buildExtensions() })`.
     Read `editorLineNumbers` from `useSettingsStore.getState()` inside it; the existing
     `[lineNumbersOn]` reconfigure effect keeps it in sync afterwards.
   - Add a module-level cache: `let cached: { loadId: number; state: EditorState } | null = null;`.
     On unmount, save `{ loadId, state: view.state }`. On mount, reuse `cached.state` if
     `cached.loadId === currentLoadId && cached.state.doc.toString() === content`; otherwise call
     `createEditorState(content)`. This keeps undo history, the selection and the search state
     across Ctrl+E and pane swaps.
   - Add an effect on `[loadId]` (skip the first run) that calls
     `view.setState(createEditorState(content))`, which gives a fresh undo history. If the path
     is unchanged (a live reload), remember `topVisibleLine(view)` before the swap and call
     `scrollToLine` afterwards so a reload doesn't jump to the top.
   - Keep the `[content]` sync effect only as a fallback, and mark its transaction
     `annotations: Transaction.addToHistory.of(false)`.
3. Verify manually (dev app): open file A, type, open file B (choose "Don't save"), press Ctrl+Z,
   and file A's text must **not** appear. Type in B, press Ctrl+E twice, press Ctrl+Z, and the
   edit is undone.

### 1.5 Saving is not crash-safe
**Cause:** `std::fs::write` truncates then writes (`src-tauri/src/commands.rs`, `write_file`).

**Fix:** add `fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()>`:
1. Temp file in the **same directory**: `.{file_name}.mdv-{pid}-{nanos}.tmp`.
2. Write the bytes, `sync_all()`, and copy the original's `permissions()` onto it if the target
   exists.
3. `std::fs::rename(tmp, path)` (on Windows this replaces an existing file).
4. On any error, remove the temp file. If the temp file **couldn't be created** (directory not
   writable), fall back to `std::fs::write(path, bytes)`. If the rename fails (e.g. the target is
   read-only or locked), return the error; don't fall back.
Use it from `write_file`. Add `#[cfg(test)]` tests using `std::env::temp_dir()`: new file,
overwrite existing, no `.tmp` left behind. The file watcher ignores the temp name (it filters by
file name) and the rename produces the event whose mtime matches our recorded save, so self-save
detection still works. Confirm this manually: save in the dev app, and no "changed on disk"
banner appears.

### 1.6 Launch can still flash default colours
**Cause:** `main.tsx` emits `app-ready` two frames after the first render, without waiting for
the settings and preset stores to load, so a user with the light theme or the Sequoia preset can
see the default dark/GitHub colours first.

**Fix:**
1. `src/lib/tauri.ts`: make `emitAppReady` idempotent (module-level `let readySent = false`).
2. `src/main.tsx`: remove the unconditional double-rAF call. Keep a fallback
   `setTimeout(emitAppReady, 1500)` so the window always appears.
3. `src/App.tsx` startup effect: after `await Promise.all([loadSettings(), loadStyles()])`, and
   after `await openFile(arg)` if there is a launch file, call
   `requestAnimationFrame(() => requestAnimationFrame(emitAppReady))`.
4. Verify: set the theme to Light and the preset to Sequoia, restart the dev app 3 times, and
   there must be no dark or GitHub-coloured frame. Take a screenshot with
   `node scripts/cdp.mjs screenshot`.

**Phase 1 verify:** `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `cargo check`, `cargo test`, and
the manual checks above. Commit each sub-fix separately (six commits) or as one "Fix data-safety
bugs from review" commit, whichever keeps diffs readable.

---

## Phase 2: HTML export fixes (`src/lib/export.ts`, `src/components/Toolbar/ExportMenu.tsx`, `src/markdown/mermaid.ts`)

1. **KaTeX version mismatch:** build the URL from the installed version:
   `import katex from 'katex'` then
   `` `https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/katex.min.css` ``. (It still needs
   internet; add a one-line comment saying so.)
2. **Unencoded `file:///` URLs:** in `rewriteAssetUrls`, after decoding, encode each path segment
   with `encodeURIComponent` but keep a leading drive letter (`C:`) unencoded; UNC paths (`//server/share/…`) become `file://server/share/…`.
   Put this in an exported `toFileUrl(path)` helper. Tests: spaces, `#`, `%`, non-ASCII, UNC.
   (If Phase 9 changes the asset host from `asset.localhost` to `mdasset.localhost`, update the
   regex there; better, match both now.)
3. **View mode not restored after HTML export:** change `ensurePreview()` to return
   `{ el, restore }` where `restore()` switches back to `'source'` if it switched away. Call
   `restore()` in a `finally` in both `exportHtml` and `exportPdf`.
4. **Mermaid race:** in `mermaid.ts` track in-flight renders
   (`const inflight = new Set<Promise<void>>()`; wrap the body of `renderMermaidBlocks` so its
   promise is added and removed) and export `whenMermaidIdle(): Promise<void>`. In `ensurePreview`,
   replace the fixed `sleep(300)` with: if the element contains `.mermaid-block`, call
   `renderMermaidBlocks(el, theme)` then `await whenMermaidIdle()`. `ensurePreview` needs the
   theme passed in.
5. **Unhandled write errors:** wrap `writeFile` in `exportHtml` in `try/catch` and set
   `useDocumentStore.setState({ error: \`Could not export: ${String(e)}\` })`. Do the same for
   `readFile`/`writeFile` in `PresetsTab.tsx` (`doImport`, `doExport`) using its `setMessage`.
6. **Empty document:** `ensurePreview` treats an empty preview as "not ready" and gives up after
   2 s. Return the element as soon as it exists, even when empty (use a flag in the view store,
   or just check `el` exists after one render tick).

**Verify:** tests for `toFileUrl`/`rewriteAssetUrls`; manual export of `fixtures/mermaid.md` and
`fixtures/math.md` from **Source** view: the app returns to Source view, the HTML shows the
diagrams, and it loads the KaTeX CSS at the right version.

---

## Phase 3: GitHub-compatible heading IDs (`src/markdown/plugins.ts`)

Match `github-slugger` (GitHub's algorithm): lowercase; remove everything except letters, marks,
numbers, connector punctuation (`_`), spaces and `-`; replace **each** space with `-` (no
collapsing, no trimming beyond what markdown-it already trims). Keep the existing `'section'`
fallback for an empty result.
```ts
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-') || 'section';
}
```
**Dedup:** GitHub appends `-1`, `-2`, … and never reuses an id. Replace the `seen` map in
`headingIds` with a `Set<string>` of used ids plus a counter per base, looping until the candidate
is unused (so headings "foo", "foo", "foo-1" give `foo`, `foo-1`, `foo-1-1`).

Update the tests in `src/markdown/render.test.ts` **deliberately**:
`slugify('Ünïcode & Symbols?')` is now `'ünïcode--symbols'`. Add cases: `'foo_bar'` →
`'foo_bar'`, `'A & B'` → `'a--b'`, `'C++ / Rust'` → `'c--rust'`, and the dedup sequence above.
Check that `Outline.test.ts` still passes (it uses ids).

---

## Phase 4: Bundle the preset fonts

The Sequoia, Obsidian and Boulayla presets name Inter, Open Sans and JetBrains Mono, which
Windows doesn't ship with.
1. `pnpm add @fontsource-variable/inter @fontsource-variable/open-sans @fontsource-variable/jetbrains-mono`.
2. Import them in `src/main.tsx`. Look inside each package: if it offers a latin-only CSS entry
   (e.g. `wght.css` plus per-subset files), import latin and latin-ext only to keep `dist/` small;
   otherwise import the default entry.
3. These packages register the families as **`'Inter Variable'`, `'Open Sans Variable'` and
   `'JetBrains Mono Variable'`**. Update the stacks in `src/styles/presets/{sequoia,obsidian,boulayla}.json`
   to put the variable name first, e.g. `"'Inter Variable', Inter, ui-sans-serif, …"`, and add the
   three names to `FONT_SUGGESTIONS` in `src/components/Settings/controls.tsx`.
4. The CSP already allows `font-src 'self'`. Verify in the dev app that
   `document.fonts.check("16px 'Inter Variable'")` is true after load, and take a screenshot of
   Sequoia.
5. Note in the README that exported HTML doesn't embed these fonts (it falls back to system fonts).

---

## Phase 5: Text encodings (UTF-8 BOM, UTF-16, invalid UTF-8)

**Problems:** a UTF-8 BOM is kept as a U+FEFF character, so a first line `# Title` is no longer
seen as a heading and the invisible character sits in the editor. UTF-16 files decode to garbage.
Invalid UTF-8 is silently replaced with `�`, and saving then makes that permanent.

**Rust (`src-tauri/src/commands.rs`):**
```rust
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Encoding { Utf8, Utf8Bom, Utf16Le, Utf16Be }

pub struct FileData { content: String, mtime: u64, encoding: Encoding, lossy: bool }
```
- `fn decode(bytes: &[u8]) -> (String, Encoding, bool)`: BOM `EF BB BF` → Utf8Bom (strip it);
  `FF FE` → Utf16Le; `FE FF` → Utf16Be (decode with `char::decode_utf16`, `lossy = true` on any
  error or an odd byte count); otherwise UTF-8 via `String::from_utf8`, falling back to
  `from_utf8_lossy` with `lossy = true`.
- `fn encode(content: &str, enc: Encoding) -> Vec<u8>` re-adds the BOM for Utf8Bom and UTF-16 (with
  a BOM).
- `write_file(path, content, encoding: Option<Encoding>)`, where `None` means UTF-8. Uses
  `write_atomic` from 1.5.
- `#[cfg(test)]` round-trip tests for all four encodings plus the invalid-UTF-8 → `lossy` case.

**Frontend:**
- `src/lib/tauri.ts`: extend `FileData` with `encoding` and `lossy`; `writeFile(path, content, encoding?)`.
- `src/store/document.ts`: store `encoding` (default `'utf-8'`) and `lossy`. `save`/`saveAs` pass
  the encoding. If `lossy` is true, `save` first shows
  `useDialogStore.getState().show('Save with replaced characters?', 'This file contained bytes that aren't valid text. Saving will replace them with �.', [...])`
  and only writes on confirmation (then clears `lossy`).
- Show a small warning banner when `lossy` is true (reuse the `.banner--warning` style in `App.tsx`).
- Export HTML and preset export keep writing plain UTF-8 (no encoding argument).
- Fixtures: `fixtures/utf8-bom.md` and `fixtures/utf16le.md` (create them with PowerShell
  `[IO.File]::WriteAllText(path, text, [Text.Encoding]::Unicode)` / `UTF8Encoding($true)`) and
  add `-text` rules for both in `.gitattributes`. Verify that the heading appears in the outline,
  and that saving keeps the encoding (check with `Format-Hex`).

---

## Phase 6: Dialogs, shortcuts and recent files

1. **Overlapping dialogs** (`src/components/Dialog/ConfirmDialog.tsx`): in `show`, if `current`
   exists, call `current.resolve(null)` before replacing it (the old request becomes "Cancel").
   Test in a new `ConfirmDialog.test.ts`: two `show` calls, and the first resolves `null`.
2. **Shortcuts while a dialog is open:** give `useShortcuts(map, enabled = true)` an `enabled`
   flag; in `App.tsx` pass `enabled = !dialogOpen` where
   `dialogOpen = useDialogStore((s) => s.current !== null)`.
3. **Zoom keys** (`App.tsx`): pull the zoom actions into `zoomIn`/`zoomOut`/`zoomReset` and bind
   `ctrl+=`, `ctrl++` (numpad plus), `ctrl+shift++` (Shift+= on US layouts) and `ctrl+shift+=`
   to zoom in; `ctrl+-` (also the numpad minus) to zoom out; `ctrl+0` to reset. Add a
   `shortcuts.test.ts` for `comboOf` with these key events.
4. **Shortcut cleanup** (`src/lib/shortcuts.ts`): the ternary on `const key = …` has identical
   branches; replace it with `const key = e.key.toLowerCase();`.
5. **Recent files:** add `removeRecentFile(path)` to `src/store/settings.ts`. In
   `document.ts` `open`'s `catch`, call it so an unreadable or missing recent file drops out of the
   list. Test it in a new `src/store/settings.test.ts` (the store works in memory when Tauri isn't
   there).
6. **`App.tsx` cleanup:** delete `const hasDoc = hasDocument;` and use `hasDocument` directly.

---

## Phase 7: Smaller UX fixes

1. **Settings written on every mouse move** (`Outline.tsx` resizer, `SplitView.tsx` divider): add
   `set(key, value, opts?: { persist?: boolean })` to the settings store (default `true`) and a
   `persist(key)` method that writes the current value. While dragging, call
   `set(..., { persist: false })`; on `mouseup`, call `persist(key)`. Also add
   `document.body.classList.add/remove('is-resizing')` to the outline resizer to match SplitView.
2. **Preset delete confirmation** (`PresetsTab.tsx`): before `remove(p.id)`, use
   `useDialogStore.getState().show('Delete preset?', \`"${p.name}" will be permanently deleted.\`, [{id:'delete',label:'Delete',danger:true},{id:'cancel',label:'Cancel',primary:true}])`.
3. **Colour row label opens the picker** (`controls.tsx`): give `Row` an `asLabel?: boolean`
   prop (default `true`) that renders a `<div>` when false; pass `asLabel={false}` for the colour
   rows in `AppearanceTab.tsx`.
4. **Stale comment:** `src/styles/app-theme.css` line 1 refers to a non-existent
   `preview-vars.css`. Reword it to say preview styling comes from `Preview.css` plus the
   variables injected by `StyleInjector` (`src/styles/presetCss.ts`).
5. **Find with case-changing characters** (`src/lib/previewFind.ts`): replace the
   `toLowerCase` + `indexOf` search with a regex built from the escaped query,
   `new RegExp(escapeRegExp(query), caseSensitive ? 'gu' : 'giu')`, using `match.index` and
   `match[0].length` for the range. Guard against zero-length matches. Add a
   `previewFind.test.ts` (jsdom): `'İstanbul'` searched as `'i̇stanbul'` / `'istanbul'` doesn't
   throw, and plain matches still give the right ranges.

---

## Phase 8: Preview hardening and remote images

1. **Raw HTML covering the app:** raw HTML may use `style="position:fixed; …"` to draw over the
   title bar or toolbar. In `src/components/Preview/Preview.css`, add `contain: paint;` to
   `.preview-scroll` (this makes it the containing block for fixed-position descendants and clips
   them to the preview), and `contain: none;` inside the existing `@media print` block in
   `src/styles/base.css` for `.preview-scroll`. Verify with a test document containing
   `<div style="position:fixed;inset:0;background:red">x</div>`: it must stay inside the preview
   pane.
2. **Keep `id` attributes** (needed for anchors and footnotes). DOMPurify's default
   `SANITIZE_DOM` already stops DOM clobbering. Add a test in `sanitize.test.ts` that
   `<img name="getElementById">` / `<form id="…">` don't survive, so this stays covered.
3. **"Block remote images" setting (default off):**
   - `src/store/settings.ts`: add `blockRemoteImages: boolean` (default `false`) to `Settings`
     and `DEFAULTS`.
   - `src/markdown/sanitize.ts`: `sanitizeHtml(html, opts?: { blockRemoteImages?: boolean })`.
     Keep a module-level flag that the existing hook reads (sanitising is synchronous, so set the
     flag, sanitise, then reset it in `finally`). When the flag is on: drop `src`/`srcset` on
     `img`/`source` elements whose value starts with `http:`, `https:` or `//` (add
     `class="remote-image-blocked"` and a `title` with the original URL), and drop any `style`
     attribute that contains `url(`.
   - `renderMarkdown` env gets `blockRemoteImages`; `Preview.tsx` reads it from settings and adds it
     to the render effect's dependencies.
   - Add a small `.remote-image-blocked` style in `Preview.css` (dashed border, alt text visible).
   - A General-tab toggle "Block remote images", plus a README line.
   - Tests in `sanitize.test.ts` / `render.test.ts` for both on and off.

---

## Phase 9: Only allow the open document's folder for local images (replaces the asset-protocol scope)

**Problem:** `allow_asset_dir` adds each opened document's folder (recursively) to Tauri's
asset-protocol scope for the rest of the session. Access builds up and can't be withdrawn.

**Fix: a custom `mdasset` protocol that only serves files under the current document's folder.**
1. Rust: new module `src-tauri/src/assets.rs`:
   - `pub struct AssetRoot(pub Mutex<Option<PathBuf>>)` (canonicalised directory), managed in
     `lib.rs`.
   - Command `set_asset_root(dir: Option<String>)` that canonicalises and stores it (`None` for an
     untitled document).
   - `.register_uri_scheme_protocol("mdasset", |ctx, request| handler(ctx.app_handle(), request))`
     in `lib.rs`. The handler percent-decodes the request path (strip the leading `/`), turns it
     into a `PathBuf`, **canonicalises** it, rejects it with 403 unless it `starts_with` the
     stored root, reads the file (404 if missing) and responds with a `Content-Type` from the
     extension (png, jpg/jpeg, gif, webp, avif, bmp, ico, svg → `image/svg+xml`; anything else
     `application/octet-stream`). Use `tauri::http::Response::builder()`. You'll need the
     `percent-encoding` crate (`cargo add percent-encoding`).
   - `#[cfg(test)]` tests for the path check (`..` traversal, a sibling directory, and an allowed
     file). Keep the check in a pure function so it's testable.
   - Remove the `allow_asset_dir` command and its registration; set `assetProtocol.enable` to
     `false` in `tauri.conf.json`; remove the `protocol-asset` feature from `Cargo.toml` if
     nothing else needs it.
2. CSP in `tauri.conf.json`: replace `asset: http://asset.localhost` with
   `mdasset: http://mdasset.localhost` in `img-src`.
3. Frontend: `src/lib/tauri.ts`: `toAssetUrl = (p) => convertFileSrc(p, 'mdasset')` (Tauri's
   `convertFileSrc(filePath, protocol)` takes a protocol argument); replace `allowAssetDir` with
   `setAssetRoot(dir: string | null)`; update the calls in `document.ts` (`open`, `saveAs`, and
   `newDocument` → `null`).
4. Update `sanitize.ts` `ALLOWED_URI_REGEXP` (add `mdasset`), the link handling in `links.ts`
   (treat `mdasset:`/`http://mdasset.localhost` as "ignore"), and `rewriteAssetUrls` in
   `export.ts` (match the `mdasset.localhost` host).
5. Verify: `fixtures/gfm.md` still shows `images/sample.png` and `images/my image.png`; an
   `<img src="http://mdasset.localhost/C%3A%5CWindows%5Cwin.ini">` in a test document is blocked
   (403 in the network panel via `read_network_requests` or cdp).

If `register_uri_scheme_protocol` doesn't behave as described in the installed Tauri version,
stop this phase, keep the old asset scope, and report what you found. Don't leave it half done.

---

## Phase 10: Improvements

1. **Mermaid SVG cache** (`src/markdown/mermaid.ts`): a module-level LRU `Map<string, string>`
   (key `${theme}:${source}`, limit about 50). In `renderMermaidBlocks`, if the key is cached,
   insert the cached SVG synchronously and skip `mermaid.render`. Every preview re-render replaces
   the DOM, so without this all diagrams redraw on every edit in Split view. (`bindFunctions` can be
   skipped for cached SVGs; `securityLevel: 'strict'` disables interactivity anyway.)
2. **Outline keyboard access** (`src/components/Outline/Outline.tsx`): give `.outline__item`
   `tabIndex={0}` and an `onKeyDown`: Enter or Space → `requestScrollToLine(n.line)`;
   ArrowRight → expand (if collapsed); ArrowLeft → collapse (if expanded); ArrowUp/ArrowDown →
   focus the previous or next visible item (`querySelectorAll('.outline__item')`). Add a visible
   `:focus-visible` style in `Outline.css`.
3. **Document-store tests** (`src/store/document.test.ts`): `vi.mock('@/lib/tauri', …)` (keep
   the real `basename`/`dirname`/`joinPath`, mock `readFile`, `writeFile`, `watchFile`,
   `unwatchFile`, `setAssetRoot`, `isTauri: () => true`), mock `@tauri-apps/plugin-dialog` and
   `@/components/Dialog/ConfirmDialog`'s `askSaveChanges`. Cover:
   - opening a CRLF file → not dirty; `save` writes CRLF.
   - `loadId` increments on open/new/reload but not on save.
   - `onFileChanged` with our own mtime → ignored; a different mtime while dirty →
     `externalChange: 'modified'`; while clean → reloads.
   - an open failure removes the path from recent files.
   - a lossy file → `save` asks before writing.

---

## Final checklist

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `cargo check`, `cargo test` all pass.
- [ ] `pnpm tauri build` succeeds (the NSIS installer builds). Run it once at the end.
- [ ] Manual pass in the dev app with every fixture: `gfm.md`, `math.md`, `mermaid.md`,
      `unicode.md`, `huge.md`, `crlf.md`, `links.md`, `utf8-bom.md`, `utf16le.md`. Screenshot the
      Sequoia preset (bundled fonts) and a blocked remote image.
- [ ] README updated: remote-image setting, encoding support, how links behave, the export
      font/KaTeX note.
- [ ] One commit per phase (or per sub-fix in Phase 1) on `fix/review-findings`; nothing pushed.

## Report back

End with a short table: each numbered item above → **done / partly done / skipped**, with one
line of explanation for anything not fully done, plus any `TODO(review)` notes left in the code
and anything that behaved differently from this plan.
