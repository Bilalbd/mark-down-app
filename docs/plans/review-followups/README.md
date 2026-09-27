# Code-review follow-ups

A code review on 2026-09-27 found 3 bugs (A1–A3), 6 efficiency items (B1–B6), 7 cleanups (C1–C7)
and 8 feature ideas (D1–D8). This folder turns all of them into phases. Each phase is done by its
own agent, **in order**, on branch `claude/review-followups`. A phase doesn't start until the one
before it is committed and the supervisor has checked it.

| Phase | Items | Document | Commit message |
|---|---|---|---|
| 1 | A1, A3 | [phase-01-find-and-escape.md](phase-01-find-and-escape.md) | `Keep the find match while editing and close one layer per Escape` |
| 2 | A2 | [phase-02-settings-across-windows.md](phase-02-settings-across-windows.md) | `Stop windows overwriting each other's settings` |
| 3 | B1, B2, B3 | [phase-03-typing-path.md](phase-03-typing-path.md) | `Cut per-keystroke work: no App re-render, no double copy or parse` |
| 4 | B4, B5 | [phase-04-rust-efficiency.md](phase-04-rust-efficiency.md) | `Serve local images off the UI thread and share folder watchers` |
| 5 | C1, C3–C6, B6 | [phase-05-cleanup.md](phase-05-cleanup.md) | `Tidy tab shortcuts, opener wrappers and small inconsistencies` |
| 6 | C7 | [phase-06-accessibility.md](phase-06-accessibility.md) | `Make resizers keyboard-operable and keep focus in dialogs` |
| 7 | D1 | [phase-07-save-split-button.md](phase-07-save-split-button.md) | `Make Save a split button: click saves, caret opens Save as` |
| 8 | D2, D3, C2 | [phase-08-tab-reorder-and-menu.md](phase-08-tab-reorder-and-menu.md) | `Reorder tabs by dragging and add a tab context menu` |
| 9 | D4, D6 | [phase-09-links-and-find.md](phase-09-links-and-find.md) | `Follow heading anchors in links and find across formatting` |
| 10 | D5 | [phase-10-new-window-mode.md](phase-10-new-window-mode.md) | `Open every file in its own window in New window mode` |
| 11 | D7 | [phase-11-self-contained-export.md](phase-11-self-contained-export.md) | `Embed images and maths fonts in exported HTML` |
| 12 | D8 | [phase-12-zoom-and-recent.md](phase-12-zoom-and-recent.md) | `Zoom the preview with Ctrl+wheel and add Clear recent files` |

## Decisions made by Bilal (don't change or re-discuss)

- **Order:** bugs and the per-keystroke costs first, then cleanups, then features.
- **D1 Save:** a **split button**. Clicking the disk icon saves at once; a small caret (▾) next
  to it opens the menu with Save and Save as….
- **D3 tab right-click menu:** Close, Close others, Close to the right, Copy path, Reveal in File
  Explorer. The last two are disabled for Untitled tabs. Closing still asks about unsaved changes.
- **D5 New window mode:** **every open goes to a new window** (Ctrl+O, drag and drop, recent files,
  links to other `.md` files, files from Explorer), except when this window shows the start screen
  or an empty untitled document: then the file opens here. A file already open in this window is
  focused instead.
- **D7 export:** a Settings toggle **"Self-contained HTML export"**, on by default. When on, local
  images are embedded as data URLs and the KaTeX stylesheet and its fonts are inlined. When off,
  export works as today (file:// images, KaTeX from the CDN).

## Supervisor decisions (small; Bilal can veto)

- Ctrl+N in New window mode keeps replacing the current document (with the usual prompt). There's
  no "new empty window" command. D5 is about opening files.
- The preset fonts (Inter, Open Sans, JetBrains Mono) are **not** embedded by D7; only images and
  KaTeX. Embedding all their unicode subsets would add around 1 MB per export. The README note
  about falling back to system fonts stays.
- Tab dragging uses pointer events, not HTML5 drag and drop: with `dragDropEnabled: true`, WebView2
  doesn't fire HTML5 drag events inside the page.

## Rules for every agent

Follow `docs/plans/tabs/README.md` ("Rules for every phase agent", "Running the dev app",
"Commands", "Final message to the supervisor") and the extra rules in
`docs/plans/save-recent-polish/README.md` ("Rules for every agent") and
`docs/plans/home-recent-and-tab-hover/README.md`. The most important points:

- Read `CLAUDE.md` in full, then this README, then your phase document, then **every file the phase
  touches** before you edit it.
- **Do only your phase.** If you notice something else, write it in your Report.
- **Never delete, rewrite or weaken existing tests.** Only add. The count is **227** before
  Phase 1. Write down the count before and after.
- **Every bug fix gets a regression test that fails without the fix.** Show this: run the new test
  before your fix (or with the fix temporarily reverted), paste the failure, then show it passing.
- **Never commit with a failing test, and never delete a test to make the suite pass.** If a new
  test fails, find out whether the code or the test is wrong and fix that.
- **Don't spy on `useXStore.setState` to prove "no update happened".** The store's own actions call
  zustand's internal `set`, which bypasses `useXStore.setState`, so the spy never fires and the test
  passes whatever the code does. Compare state identity instead:
  `const before = useXStore.getState(); …; expect(useXStore.getState()).toBe(before)`.
- No `any`, no `as unknown as` outside real boundaries, no `console.log`, no commented-out code, no
  eslint-disable comments. Pick store fields with one selector per value.
- British spelling in UI text and comments, American in identifiers. Sentence case for labels.
  Icons from `lucide-react` with the shared `ICON` props.
- **Backslashes:** write anything containing `\` (Windows paths, regexes) with the Write/Edit tools,
  never heredocs, `echo` or `sed`.
- **Never let the app write to files in the repo.** For manual checks open **copies** of fixtures
  from your scratchpad. The dev app shares Bilal's real `settings.json` and `presets.json`: read
  any setting you change first (theme, recent files, openFilesIn, …) and put it back exactly.
  Paste the before and after values in your Report (for recent files, give only the count, not the
  paths).
- Check visible changes in **light and dark**. The display is at 175% scaling (screenshots are
  in device pixels, so CSS px × 1.75). Crop and enlarge small UI details, open every screenshot with
  the Read tool, and describe only what it actually shows.
- **The manual check is never optional.** If the dev app isn't reachable over CDP
  (`node scripts/cdp.mjs eval "document.title"`) within 5 minutes: stop **everything** you started
  (`Stop-Process -Name markdown-viewer,cargo`, the process listening on port 1420, and your
  background task), check with `Get-Process markdown-viewer` and `Get-NetTCPConnection -LocalPort
  1420,9222` that nothing is left, then start it **once** more. A `markdown-viewer` process with no
  port 9222 is hung: kill it; don't wait on it. If the second try fails too, say so plainly in your
  final message; never describe the check as done or "deferred". Before you finish, confirm no
  `markdown-viewer`, `cargo` or port-1420 process of yours is still running.
- CDP can't hover or right-click. Where a phase needs that, it tells you how to trigger the state
  from `eval` instead.
- Keep scratch files in your scratchpad. Before committing, `git status` must show only the files
  your phase lists (plus the phase document). Don't stage `src-tauri/Cargo.toml` changes made by the
  Tauri CLI unless your phase adds a dependency.
- Tick each task's checkbox in your phase document as you finish it, fill in its **Report**
  section, and commit the document with your code. Commit once, with the message from the table,
  ending with a blank line and `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>`.
- Update `README.md` in the same commit when your phase changes a feature, shortcut or setting
  (each phase says whether it does).

## Definition of done (every phase)

`pnpm test`, `pnpm lint` and `npx tsc --noEmit` pass, and `pnpm format` has been run. If Rust
changed: `cargo check` and `cargo test` pass. Visible changes are checked in the running app with
screenshots in both themes. The phase document's checkboxes are ticked and its Report is filled in.

## Launching a phase agent (supervisor)

One Haiku agent per phase, in the foreground, in this worktree. Prompt:

> You are implementing Phase N of `docs/plans/review-followups/`. Read `CLAUDE.md`,
> `docs/plans/review-followups/README.md` and `docs/plans/review-followups/<phase doc>` in full,
> then do exactly what the phase document says, ticking its checkboxes and filling in its Report.
> Commit once at the end as the README describes. Finish with the "Final message to the
> supervisor" from `docs/plans/tabs/README.md`.

After each phase, the supervisor:

1. Reads the full diff (`git show --stat` then `git show`) against the phase document: no stray
   files, no deleted or weakened tests, no scope creep.
2. Re-runs `pnpm test`, `pnpm lint`, `npx tsc --noEmit` (and cargo for Phases 4 and 11).
3. For bug fixes, reverts the fix locally and checks that the new test fails, then restores it.
4. Opens the agent's screenshots, and re-takes any that don't clearly show the claim.
5. Checks Bilal's settings (theme, recent-files count, openFilesIn, zoom, splitRatio,
   outlineWidth) are back to what they were.
6. Fills in the table below. If something's wrong, sends the agent back with specific fixes;
   small corrections go in a separate follow-up commit.

## Report-back table (supervisor fills in)

| Phase | Commit | Tests before → after | Supervisor check | Notes |
|---|---|---|---|---|
| 1 | 2a97b90, 47d9a8b | 227 → 234 | Diff reviewed; Escape test fails without fix; A1/A3 checked in app by supervisor (old vs new FindBar) | Agent skipped the manual check twice; its dev app hung without a WebView |
| 2 | ff6b479, b883752, 7847b2e, 76f4dd3 + supervisor fix | 234 → 248 | Three review rounds (id-only preset compare, write-queue deadlock, failing/deleted/vacuous tests); supervisor finished the race fix and tests; checked in app with settings restored | Agent's dev app failed to launch twice; supervisor's launched fine |
| 3 | ea1e4d6 | 248 → 252 | Diff reviewed; render counts, outline in all views and huge.md timing checked in app by supervisor | Clean first round; App renders per 10 keystrokes 20 → 0; huge.md p90 48 → 25 ms |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
| 11 | | | | |
| 12 | | | | |
