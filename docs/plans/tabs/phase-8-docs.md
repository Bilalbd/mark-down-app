# Phase 8: Fixtures, README, installer

**Goal:** tabs are documented, there are hand-test fixtures for them, and the installed app
(NSIS build) behaves correctly with real Explorer double-clicks.

Read `docs/plans/tabs/README.md` (agent rules) first, then `README.md`, `fixtures/links.md` (for
the fixture style) and `docs/plans/tabs.md` §0 (decisions).

## Files

- `fixtures/tabs/one.md`, `fixtures/tabs/two.md`, `fixtures/tabs/a/README.md`,
  `fixtures/tabs/b/README.md` (new)
- `README.md`

## Tasks

### A. Fixtures

- [ ] **A1.** `fixtures/tabs/one.md`: a heading "Tabs fixture: one", a short "What to check" list
  (opens as a tab; the link below opens `two.md` as a second tab in tab mode and replaces this
  document in window mode; Ctrl+Tab switches; the undo history is kept per tab), a link
  `[Go to two](two.md)`, and ~60 lines of numbered paragraphs so there is something to scroll
  (checks per-tab scroll).
- [ ] **A2.** `fixtures/tabs/two.md`: the same shape, linking back to `one.md`.
- [ ] **A3.** `fixtures/tabs/a/README.md` and `fixtures/tabs/b/README.md`: one line each, saying
  "Open both: the tab labels should read `README.md · a` and `README.md · b`."

### B. README

- [ ] **B1.** Read the whole README first. In the features section, add a **Tabs** item: files
  open as tabs in the title bar; drag files, use Ctrl+O (several at once) or open from Explorer;
  each tab keeps its own view mode, scroll position and undo history; a file that's already open
  is focused. Mention the **Open files in** setting (New tab / New window, default New tab)
  wherever the other settings are described.
- [ ] **B2.** Add the new shortcuts to the README's shortcuts table (if it has one): Ctrl+T, Ctrl+W,
  Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+1 … Ctrl+9.
- [ ] **B3.** Say plainly that open tabs aren't restored when the app restarts.
- [ ] **B4.** If the README describes the source layout, add `components/Tabs/`, `store/tabs.ts`
  and `lib/tabs.ts` / `lib/editorCache.ts` where they fit.
- [ ] **B5.** If there's a fixtures list, add `fixtures/tabs/`.

### C. Installer check

- [ ] **C1.** Build: `pnpm tauri build` (needs cargo on the path, as in README "Commands"). It
  takes several minutes. Report the installer path from the output (under
  `src-tauri\target\release\bundle\nsis\`).
- [ ] **C2.** **Don't install it**: installing changes the user's file associations, so it's
  the maintainer's call. Instead, test the release exe directly, which behaves the same for
  single-instance routing:
  1. Start `src-tauri\target\release\markdown-viewer.exe "<abs>\fixtures\tabs\one.md"` with
     `Start-Process`.
  2. Launch it again with `two.md`, then with `a\README.md` and `b\README.md`. Expect one process
     (`Get-Process markdown-viewer`).
  3. The release build has no CDP, so take evidence another way: check the process count and
     the window title (`(Get-Process markdown-viewer).MainWindowTitle` shows the active tab), and
     describe what you saw.
  4. Stop the processes afterwards.
  If the release build fails, report the error and don't commit changes that depend on it (the
  fixtures and README can still be committed).

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `cargo check`, `cargo test` pass.
- [ ] `git status` shows only the fixtures, `README.md` and this phase document (build output is
  git-ignored; check that no `target/` or `dist/` files are staged).
- [ ] Commit: `Document tabs and add tab fixtures`.

## Report

_(Fill in: the installer path, the release-exe check results, and anything in the README you
weren't sure about.)_
