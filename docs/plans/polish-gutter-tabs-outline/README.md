# Polish: line numbers, Chrome-style tabs, step-by-step outline

Three independent phases, each done by its own agent, in order, on branch
`claude/polish-gutter-tabs-outline`:

| Phase | Document | Commit message |
|---|---|---|
| 1 | [phase-1-line-numbers.md](phase-1-line-numbers.md) | `Make source-view line numbers subtle` |
| 2 | [phase-2-chrome-tabs.md](phase-2-chrome-tabs.md) | `Give tabs a Chrome-style shape joined to the toolbar` |
| 3 | [phase-3-outline-levels.md](phase-3-outline-levels.md) | `Expand and collapse the outline one level at a time` |

## Decisions made by Bilal (don't change or re-discuss)

- **Line numbers:** normal weight (not bold), a faint low-contrast colour. The line with the
  cursor is one step clearer than the rest, as in VS Code.
- **Tabs:** Chrome style. The title bar becomes a shade darker than the toolbar. Tabs have rounded
  top corners and start a few pixels below the top of the window. The active tab has the toolbar's
  colour, so it flows into the toolbar, with no accent underline. Inactive tabs are flat, with thin
  separators, and show a rounded highlight on hover.
- **Outline:** four icon buttons in the outline header: expand all, expand one level, collapse one
  level, collapse all. Each has a tooltip. A button whose action wouldn't change anything is
  greyed out (disabled).

## Rules for every agent

Follow `docs/plans/tabs/README.md` ("Rules for every phase agent", "Running the dev app",
"Commands", "Final message to the supervisor") exactly. In addition:

- **Never delete, rewrite or weaken existing tests.** Only add. Note the test count before you
  start (200) and make sure it doesn't go down.
- The stores are on `window.__mdv` (`document`, `settings`, `view`, `style`, `tabs`). The live
  CodeMirror view is `window.__mdv.view.getState().editorView` (Source/Split only).
- `node scripts/cdp.mjs eval` takes a **single expression**. For anything longer, use `eval-file` with
  a script that ends in `return {...}`.
- **Starting the dev app:** first run `Stop-Process -Name markdown-viewer -ErrorAction
  SilentlyContinue` and free port 1420, then start `.\scripts\dev.ps1 "<absolute path>"` with
  `run_in_background`. Poll `node scripts/cdp.mjs eval "document.title"` every ~10 s for up to
  ~5 minutes. If it never becomes ready, stop everything, wait a few seconds and try once more.
  If it still fails, say so; don't claim the manual checks passed.
- Every manual check you report must be backed by eval output you read, or a screenshot you opened
  with the Read tool that visibly shows it. The supervisor re-checks screenshots.
- **Both themes, and more than one preset:** visual changes must be checked in light and dark, and
  with at least two presets (`__mdv.style.setState({ activePresetId: 'builtin-github' })`, then
  `'builtin-sequoia'`). Use `setState`, not `setActive`, so nothing is saved. Afterwards, put
  `appTheme` and the active preset back to what they were when you started (read them first).
- The Tauri CLI may rewrite `src-tauri/Cargo.toml` (`features = []`). Don't stage that.
- Stop the app and the dev server before you finish.
