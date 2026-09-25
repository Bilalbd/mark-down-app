# Phase 1: Update the project rules

**Goal:** the project rules stop forbidding tabs, and they describe the new tabs store and the
extra close path, so later phases (and future agents) don't treat tabs as a rule violation.
Documentation only; no code.

Read `docs/plans/tabs/README.md` (agent rules) first.

## Tasks

- [ ] **1. `CLAUDE.md` §1 "Product decisions".** Replace the bullet
  `- **One file per window.** No tabs, no folder browser or file tree.` with:
  `- **Tabs or windows**, chosen by the *Open files in* setting (default: tabs). No folder browser or file tree.`
- [ ] **2. `CLAUDE.md` §1 "Out of scope" bullet.** Remove `tabs, ` from the list so it reads:
  `Obsidian syntax (callouts, \`[[wikilinks]]\`, \`==highlight==\`), a folder browser, **autosave**, restoring open tabs on relaunch.`
  (Add "restoring open tabs on relaunch" as shown; it's a decision in `docs/plans/tabs.md` §0.)
- [ ] **3. `CLAUDE.md` §3 "Which store to use".** After the `view` bullet, add:
  `  - \`tabs\`: the open tabs, and a snapshot of each inactive tab's document and view state. The
    document store always holds the tab on screen. Never saved.`
  (Match the indentation of the other bullets.)
- [ ] **4. `CLAUDE.md` §4 "Unsaved work is sacred".** In the list in brackets, add `closing a tab`
  after `window close`, so it reads `(open, new, drag-and-drop, recent files, links to other \`.md\` files, window close, closing a tab)`.
- [ ] **5. `README.md`.** Search it for wording saying the app is one file per window or has no
  tabs (`Select-String -Path README.md -Pattern "tab|window" `). If a sentence says tabs aren't
  supported, delete or neutralise just that sentence. Don't describe the tab feature yet; that
  happens in Phase 8. If nothing matches, change nothing and say so in the Report.
- [ ] **6. Don't touch** `docs/plans/review-fixes-plan.md` (it's a historical record).

## Verify

- [ ] `git diff` shows only the edits above, in `CLAUDE.md`, `README.md` (if needed) and this file.
- [ ] Commit: `Allow tabs: update project rules for tabbed documents`.

## Report

_(Fill in: what changed in README.md, if anything; anything unclear.)_
