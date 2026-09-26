# New-tab menu and full-width Formatted view

Two small, independent features, each done by its own agent, in order:

| Part | Document | Commit message |
|---|---|---|
| A | [part-a-new-menu.md](part-a-new-menu.md) | `Turn the new-tab button into a New file / Open file menu` |
| B | [part-b-full-width.md](part-b-full-width.md) | `Add a full-width toggle for the Formatted view` |

## Decisions made by Bilal (don't change or re-discuss)

- **+ button:** pressing the `+` at the end of the tab strip opens a small menu with
  **New file** (Ctrl+T) and **Open file…** (Ctrl+O), instead of creating a tab straight away.
- **Full width:** a toggle button in the **toolbar**, shown only in **Formatted** view (like the
  swap-panes button that only shows in Split view). When on, the formatted document fills the
  window width instead of the preset's content width.
- It's **saved** with the other preferences and applies to every tab and window.
- It affects **Formatted view only**, not the formatted pane in Split view.
- **No keyboard shortcut** for it.

## Rules for every agent

Follow `docs/plans/tabs/README.md` ("Rules for every phase agent", "Running the dev app",
"Commands", "Final message to the supervisor") exactly; they apply here too. In addition:

- **Never delete, rewrite or weaken existing tests.** Only add. Note the test count before you
  start and make sure it goes up.
- In the running app the stores are on `window.__mdv` (`document`, `settings`, `view`, `style`,
  `tabs`). The live CodeMirror view is `window.__mdv.view.getState().editorView` (Source/Split
  view only). There is nothing else on `__mdv`.
- Every manual check you report as passed must be backed by a value you read back (paste the eval
  output) or a screenshot you opened with the Read tool that visibly shows it. If something didn't
  work, say so. The supervisor re-checks.
- The Tauri CLI may rewrite `src-tauri/Cargo.toml` (`features = []`). Don't stage that.
- The work happens on branch `claude/new-menu-and-full-width`. Don't switch branches.
