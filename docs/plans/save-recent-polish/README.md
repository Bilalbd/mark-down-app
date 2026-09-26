# Save menu, Open recent, toolbar and scrollbar polish

Three phases, each done by its own agent, in order, on branch `claude/save-recent-polish`:

| Phase | Document | Commit message |
|---|---|---|
| 1 | [phase-1-save-menu.md](phase-1-save-menu.md) | `Add a Save menu with Save as and drop the New file toolbar button` |
| 2 | [phase-2-open-recent.md](phase-2-open-recent.md) | `Add Open recent to the new-tab menu` |
| 3 | [phase-3-polish.md](phase-3-polish.md) | `Centre the view-mode highlight and theme the scrollbars` |

## Decisions made by Bilal (don't change or re-discuss)

- **Save as:** a Save icon button in the toolbar, where the New file button is today. It opens a
  small menu (same style as the Export menu) with **Save** (Ctrl+S) and **Save as…** (Ctrl+Shift+S).
  Ctrl+Shift+S also works as a shortcut on its own.
- **New file button:** removed from the toolbar. The `+` menu in the tab strip and Ctrl+N / Ctrl+T
  still create files.
- **Open recent:** a third item in the `+` menu, **Open recent ›**. It opens a **side flyout** (a
  second panel next to the menu, like a classic Windows submenu) listing the recent files.
- **Scrollbars:** slim (about 10px), rounded thumb in the theme's muted colour on a transparent track,
  and a little stronger on hover, like VS Code or Obsidian.
- **View-mode highlight:** the highlighted Formatted / Source / Split button must look evenly inset
  on all four sides.

## Rules for every agent

Follow `docs/plans/tabs/README.md` ("Rules for every phase agent", "Running the dev app",
"Commands", "Final message to the supervisor") exactly. In addition:

- **Never delete, rewrite or weaken existing tests.** Only add. The count is 211 at the start.
- The stores are on `window.__mdv` (`document`, `settings`, `view`, `style`, `tabs`).
- `node scripts/cdp.mjs eval` takes a **single expression**. For anything longer, use `eval-file` with
  a script that ends in `return {...}`. Write scripts that contain Windows paths with the Write tool.
- **Starting the dev app:** first `Stop-Process -Name markdown-viewer -ErrorAction SilentlyContinue`
  and free port 1420, then start `.\scripts\dev.ps1 "<absolute path>"` with `run_in_background`.
  Poll `node scripts/cdp.mjs eval "document.title"` every ~10 s for up to ~5 minutes. If it never
  becomes ready, stop everything, wait a few seconds and try once more; if it still fails, say so.
- Every manual check must be backed by eval output you read, or a screenshot you opened with the
  Read tool that visibly shows it. The supervisor re-checks screenshots. For small UI details,
  **crop and enlarge** the relevant area (PowerShell `System.Drawing`, as in earlier phases) before
  judging it.
- Check visual changes in **light and dark** (`__mdv.settings.getState().set('appTheme', …)`) and
  put the theme back to what it was when you started (read it first).
- Keep scratch files (logs, test output, scripts) in your scratchpad, **never** in the repo. Before
  committing, `git status` must show only the files your task lists.
- The Tauri CLI may rewrite `src-tauri/Cargo.toml` (`features = []`). Don't stage that.
- Stop the app and the dev server before you finish.
