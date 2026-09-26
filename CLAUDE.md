# Project guide for AI agents

**Markdown** is a small, fast Markdown viewer and editor for Windows. It is built with Tauri 2
(Rust + WebView2), React 19, TypeScript, CodeMirror 6, markdown-it, Shiki, KaTeX and Mermaid.
The maintainer is Bilal. This file sets the rules every agent follows so the codebase stays
consistent. Read it fully before changing anything. `README.md` covers features and layout.

---

## 1. Product decisions: do not change or re-discuss

These are settled. Don't propose alternatives unless Bilal asks.

- **Tabs or windows**, chosen by the *Open files in* setting (default: tabs). No folder browser or file tree.
- **Views:** Formatted / Source / Split, switched with Ctrl+E and Ctrl+Shift+E. The app always
  starts in Formatted (`viewMode` is deliberately not saved).
- **Styling:** presets, each with a light and a dark colour set, plus a custom-CSS slot.
- **Packaging:** NSIS installer, per-user, registers `.md` / `.markdown`.
- **Out of scope:** Obsidian syntax (callouts, `[[wikilinks]]`, `==highlight==`), a folder
  browser, **autosave**, restoring open tabs on relaunch. Don't add these, even partially or behind a flag.

When a request is ambiguous or has several reasonable designs, **present 2–4 options with a
recommendation and let Bilal pick.** Don't choose silently on anything he'd see or feel.

---

## 2. Commands

Run from the repo root in PowerShell. The package manager is **pnpm**; don't use npm or yarn to
install anything.

| Task | Command |
|---|---|
| Unit tests | `pnpm test` |
| Lint | `pnpm lint` |
| Typecheck | `npx tsc --noEmit` |
| Format touched files | `pnpm format` |
| Rust check / tests | `$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path; cd src-tauri; cargo check; cargo test` |
| Run the app (dev) | `.\scripts\dev.ps1 [file.md]` (WebView2 remote debugging on port 9222) |
| Drive the running app | `node scripts/cdp.mjs eval "<js>"` · `eval-file <f.js>` · `screenshot <out.png>` · `pdf <out.pdf>` |
| Installer | `pnpm tauri build` |

In dev builds the stores are exposed on `window.__mdv` (`document`, `settings`, `view`, `style`,
`render`), so you can check state with `cdp.mjs eval`.

**Definition of done:** tests, lint and typecheck pass; `cargo check` and `cargo test` also pass
if Rust changed. Anything visible has been checked in the running app (a screenshot counts),
using the relevant `fixtures/*.md` files.

### Machine quirks
- The **Bash tool turns `\\` into `\`** on this machine. Write anything that contains backslashes
  (regexes, Windows paths, TeX) with the **Write/Edit tools**, never with heredocs, `echo` or
  `sed`.
- Screenshots: `cdp.mjs screenshot` and PrintWindow work; `CopyFromScreen` gives a black image.
- `.gitattributes` forces LF (`* text=auto eol=lf`). Fixtures that must keep other line endings
  or encodings need their own `-text` line.

---

## 3. Architecture and where things go

```
src/
  main.tsx, App.tsx      bootstrapping, top-level layout, app-wide shortcuts and events
  components/<Name>/     one folder per UI feature: <Name>.tsx + <Name>.css (+ <Name>.test.ts)
  store/                 zustand stores: document, settings, style (presets), view (transient UI)
  markdown/              render pipeline: markdown-it + plugins, Shiki, KaTeX, Mermaid, DOMPurify
  lib/                   framework-free helpers and Tauri wrappers (tauri.ts, shortcuts, export…)
  styles/                app-theme.css, base.css, preset → CSS mapping, presets/*.json
src-tauri/src/           lib.rs (builder, navigation guard), commands.rs (file I/O, encodings),
                         watch.rs (file watcher), assets.rs (mdasset:// local-image protocol)
fixtures/                hand-test documents: one per feature area
docs/plans/              implementation plans for agents
```

Placement rules:
- **All Tauri calls go through `src/lib/tauri.ts`.** Components and stores never call `invoke`
  directly. Every wrapper must be safe when Tauri isn't there: use `isTauri()` and fall back or do
  nothing, because tests and plain Vite dev run in a browser.
- **Pure logic goes in `lib/` or `markdown/` as exported functions** with unit tests (see
  `scrollSync.ts`, `export.ts`). Components hold wiring and side effects, not algorithms.
- **Which store to use:**
  - `document`: the open file (path, content, saved state, file-watching reactions).
  - `settings`: user preferences, saved to `settings.json`. Add new keys to both `Settings` and
    `DEFAULTS`. Anything that shouldn't be saved goes in `EPHEMERAL_KEYS`.
  - `style`: presets, saved to `presets.json`. Built-in presets live in
    `src/styles/presets/*.json` and are never modified at runtime; `updateActive` copies them
    first.
  - `view`: short-lived UI state and live element handles. Never saved.
  - `tabs`: the open tabs, and a snapshot of each inactive tab's document and view state. The
    document store always holds the tab on screen. Never saved.
- **Rust stays thin:** file I/O, the file watcher, the local-image protocol and window lifecycle.
  Rendering, parsing and UI logic belong in TypeScript.
- **New Tauri command:** add it to `generate_handler!` in `lib.rs`, add a typed wrapper in
  `tauri.ts`, and give it the **narrowest** permission in `capabilities/default.json`. Never widen
  the CSP or add broad permissions (`fs:*`, `shell:*`, `"path": "**"` scopes) without asking
  Bilal.

---

## 4. Invariants: keep these true

- **Unsaved work is sacred.** Every path that replaces or closes the document goes through
  `confirmDiscard()` (open, new, drag-and-drop, recent files, links to other `.md` files, window
  close, closing a tab). Never add a code path that reloads the webview or navigates it away.
- **Saves are atomic and keep the file as it was.** Write through `write_file`, which writes a
  temp file and renames it. Keep the file's line ending and encoding: content is held with LF
  line endings in memory and converted back on save.
- **Our own saves don't count as external changes.** The watcher reports every change; the
  document store ignores the one whose mtime matches the save it just made. Keep `mtime` updated
  whenever you write.
- **All rendered HTML goes through `sanitizeHtml`.** Never set `innerHTML` or use
  `dangerouslySetInnerHTML` with unsanitised text. The one exception is Mermaid's own output in
  strict mode.
- **Every link click in the preview is intercepted.** Nothing may navigate the app window. The
  Rust navigation guard is a safety net, not the main mechanism.
- **Local images only come from the open document's folder.** Don't widen that access.
- **The preview is driven by CSS variables.** Every visual property in `Preview.css` reads a
  `--md-*` variable; presets set the variables (`presetCss.ts`) and the app chrome derives from
  the preset (`chromeCss.ts`). Don't hard-code colours or fonts in preview CSS; add a variable and
  map it.
- **Both themes, always.** Any colour you add needs a light and a dark value. Check both
  (`appTheme` light and dark) before you're done.
- **No flash at launch.** The window starts hidden and is shown on `app-ready`. Don't show it
  earlier, and don't add startup work that changes the first painted frame.
- **Rendering stays debounced and fast.** Preview render is debounced (150 ms), the outline uses
  the cheap `extractHeadings`, and Shiki and Mermaid load lazily and cache their output. Keep
  heavy dependencies behind dynamic `import()`, and check `fixtures/huge.md` after changes to the
  render or editor path.

---

## 5. Coding etiquette

### General
- **Match the code around you**: naming, comment density, file shape. Read the neighbouring
  files first.
- **Small, focused changes.** No drive-by refactors, reformatting unrelated code or renaming
  things you weren't asked to touch. If you spot something worth fixing, mention it and don't
  fix it in the same change.
- **No new dependencies without a reason** stated in the commit message. Prefer the platform
  (DOM, CSS, Web APIs) or what's already installed. Add dependencies with `pnpm add`.
- **No dead code, no commented-out code, no `console.log`** left behind. `TODO(<topic>):`
  comments only when paired with something you report to Bilal.

### TypeScript and React
- Strict TypeScript. No `any`; no `as unknown as` except at real boundaries (JSON imports, test
  shims). Prefer `interface` for object shapes and string-literal unions for enums.
- Formatting: Prettier (`.prettierrc`: single quotes, semicolons, trailing commas, width 100).
  Import through the `@/` alias across folders; relative imports only within the same folder.
- Function components with hooks only. Pick zustand store fields with **one selector per value**
  (`useStore((s) => s.x)`); don't take the whole store in components that render often.
- Outside React (event handlers, async flows, other stores), read with `useXStore.getState()`.
- Async event handlers: `onClick={() => void doThing()}`. **Every awaited Tauri call handles
  failure**: show it in the UI (the document store's `error`, or a local message) or deliberately
  `.catch(() => undefined)` with a comment saying why it's safe to ignore.
- Effects that subscribe to Tauri events follow the existing pattern: `let unlisten`, subscribe
  with `.then((u) => (unlisten = u))`, return `() => unlisten?.()`.
- Exported helpers get a one-line `/** … */` JSDoc saying *what* and, if not obvious, *why*.
  Comments explain intent and constraints, not what the code plainly does.

### CSS
- BEM-style classes scoped by component: `.block`, `.block__element`, `.block--modifier`; state
  via `.is-active`, `.is-hidden`, `.is-error`, etc.
- Each component imports its own CSS file. Global rules live only in `styles/base.css` and
  `styles/app-theme.css`.
- Colours come from tokens: chrome uses `--chrome-*`, `--content-*`, `--accent`; the preview uses
  `--md-*`. No raw hex values in component CSS except for new tokens in `app-theme.css`.
- Keep print output working (`@media print` in `base.css`) when you add layout wrappers.

### Rust
- `rustfmt` defaults. Commands return `Result<T, String>` and map errors with
  `.map_err(|e| e.to_string())`. No `unwrap()`/`expect()` on anything that depends on user files
  or the environment.
- Serde structs sent to the frontend use `#[serde(rename_all = "camelCase")]`.
- Put testable logic in pure functions with `#[cfg(test)]` unit tests.

### UI text
- UI strings and comments use **British spelling** ("Colours", "normalise"); code identifiers use American
  (`ColorSet`, `color`). Sentence case for labels and buttons; `…` (a real ellipsis) on items that
  open a dialog.
- Windows conventions: "Follow Windows", Ctrl shortcuts. Any new shortcut goes in **three places**:
  `App.tsx`, the button `title`, and the shortcuts table in `GeneralTab.tsx` (and in the README if
  it's a main feature).
- Icons come from `lucide-react` using the shared `ICON` props in `Toolbar.tsx`. No hand-drawn
  SVG icons.
- Accessibility: real `<button>`s for actions, `aria-label` on icon-only buttons, `aria-pressed`
  on toggles, keyboard reachable.

---

## 6. Testing

- Tests live **next to the code** (`foo.ts` → `foo.test.ts`), use vitest and `describe`/`it`, and
  run in jsdom.
- **Every bug fix gets a regression test** that fails without the fix, where the logic can be
  tested without the real app. Every new pure helper gets tests.
- Mock at the boundary: `vi.mock('@/lib/tauri')` and the `@tauri-apps/*` plugins. Don't mock
  internal helpers.
- Changes you can see in the app are also checked in the running app with the matching fixture
  (`gfm`, `math`, `mermaid`, `unicode`, `huge`, …). Add a fixture when you add a feature area.
- Never weaken or delete an existing test to make a change pass. If a test's expectation really
  changes (e.g. a deliberate behaviour change), update it in the same commit and say why in the
  message.

---

## 7. Git and workflow

- Don't commit to `main` directly. Work on a feature branch; commit only when asked or when a plan
  says to; **never push, force-push or open PRs unless Bilal asks.**
- **One logical change per commit.** Messages are imperative, sentence case, no conventional-commit
  prefix, and say what and why, e.g. `Preserve CRLF line endings on save`. A preset-specific
  change may use a `Preset:` prefix (`Nord: lighten light-mode background`).
- Never use a bare `git stash` / `git stash pop`; the stash is shared across worktrees and other
  agents. Use a temporary WIP commit instead.
- Never skip hooks (`--no-verify`) or rewrite published history.
- Keep `README.md` in sync when you change features, shortcuts, settings, storage locations or dev
  commands.
- Larger work starts as a plan in `docs/plans/<topic>.md` (context, phases, verification, a
  report-back table) so another agent can pick it up cold.

---

## 8. When you finish

Report back briefly: what changed (with file links), how you verified it (commands and
screenshots), anything you skipped or couldn't verify, and any follow-ups. Say plainly if
something failed. Don't describe work as done or verified when it isn't.
