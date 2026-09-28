# v0.8 polish

Eight changes Bilal asked for on 2026-09-27, before calling the app 0.8. This folder turns them into
seven phases. Each phase is done by its own sub-agent (Haiku for Phases 1–4, Sonnet 5 from 2026-09-28 on, at Bilal's request), **in order**, on branch
`claude/v0.8-polish`. A phase doesn't start until the one before it is committed and the
supervisor has checked it.

| Phase | Change | Document | Commit message |
|---|---|---|---|
| 1 | Smaller "+" tab button; stronger active line | [phase-01-tab-plus-and-active-line.md](phase-01-tab-plus-and-active-line.md) | `Shrink the new-tab button and strengthen the active line` |
| 2 | Icon view-mode switcher | [phase-02-view-switcher.md](phase-02-view-switcher.md) | `Use icons in the view mode switcher` |
| 3 | Status bar | [phase-03-status-bar.md](phase-03-status-bar.md) | `Add a status bar with cursor position, counts, zoom and encoding` |
| 4 | Split view mirrors the cursor's block | [phase-04-split-cursor-mirror.md](phase-04-split-cursor-mirror.md) | `Mirror the source cursor's block in the split preview` |
| 5 | HEX colour swatches | [phase-05-hex-swatches.md](phase-05-hex-swatches.md) | `Show a colour swatch next to HEX colour codes` |
| 6 | Suggested name for untitled saves | [phase-06-suggested-file-name.md](phase-06-suggested-file-name.md) | `Suggest a file name from the first heading or line when saving` |
| 7 | Version 0.8.0 | [phase-07-version-0-8.md](phase-07-version-0-8.md) | `Bump version to 0.8.0` |

Phase 4 depends on Phase 3 (it reuses the cursor position the status bar adds to the view store).
The others are independent, but keep the order so each agent starts from a known state.

## Decisions made by Bilal (don't change or re-discuss)

- **View mode icons:** icon-only buttons, **Eye** (Formatted), **Code** (Source), **Columns2**
  (Split) from `lucide-react`. Tooltips keep the names and shortcuts. The active segment is a raised
  chip with an accent-coloured icon, like the other toolbar toggles.
- **Split view mirror:** the block holding the source cursor gets a **faint background tint** in the
  formatted pane, the same strength as the editor's active line. No bar, no scrolling.
- **HEX swatches:** in the **formatted view only**, next to HEX codes written as inline code
  (`` `#AA00BB` ``) **and** in plain text. Not in the source editor. For inline code the swatch sits
  **inside the code pill**, after the code text.
- **Status bar contents:** Ln/Col, total lines, zoom %, **word count**, **encoding and line
  endings**, and a static **"Markdown"** language label. A **"Show status bar"** toggle in Settings →
  General, on by default.

## Supervisor decisions (small; Bilal can veto)

- **"+" button:** same box as the tab's close button (18 × 18 px, 4 px radius, same hover
  background), with the same 14 px icon. There's no animation today, so none is added.
- **Active line:** background tint from 4% to 7% of the text colour; the active line number uses
  the full content colour, and the gutter cell gets the same tint so the highlight reads as one band.
- **Status bar layout:** left: `Ln 12, Col 5` · `240 lines` · `1,234 words` (or `12 of 1,234 words`
  with a selection). Right: zoom `100%` (a button; click resets the zoom, like Ctrl+0) · `UTF-8` ·
  `CRLF` · `Markdown`. Ln/Col is hidden in Formatted view (there's no cursor). The bar is hidden on
  the start screen (no document) and when printing.
- **HEX in plain text:** 6 or 8 digits always count; 3 or 4 digits only when there's at least one
  letter a–f (so issue numbers like `#123` or `#2024` don't get swatches). Inline code counts any
  valid length (3, 4, 6 or 8). Nothing inside link text. The swatch goes **after** the code.
- **Suggested file name:** the first heading's text if the document has a heading, otherwise the
  first non-empty line (front matter is skipped). At most 5 words, Markdown syntax and characters
  Windows doesn't allow in file names removed, falling back to `Untitled`. Only for untitled
  documents; a saved file's Save as still starts from its own name.
- **Version display:** Phase 7 also shows `Version 0.8.0` at the bottom of Settings → General, read
  from Tauri at runtime, so the number is visible somewhere in the app.

## Rules for every agent

Follow the "Rules for every agent" and "Definition of done" sections of
[`../review-followups/README.md`](../review-followups/README.md), which point to the tabs and
save-recent-polish rules too. They all apply here. In particular:

- Read `CLAUDE.md` in full, then this README, then your phase document, then **every file your
  phase touches** before you edit it.
- **Do only your phase.** Anything else you notice goes in your Report.
- **Never delete, rewrite or weaken existing tests.** Only add. The count is **377** before
  Phase 1 (`pnpm test`). Write down the count before and after.
- Every new pure helper gets unit tests next to it. Every visible change is checked in the running
  app in **light and dark**, with screenshots you open and describe honestly.
- Before your first dev-app launch, back up `%APPDATA%\com.bilal.markdown-viewer\settings.json`,
  `presets.json` and `.window-state.json` to your scratchpad, and put them back at the end. Open
  **copies** of fixtures from your scratchpad, never the repo files.
- Backslashes (Windows paths, regexes) only through the Write/Edit tools.
- Commit once, with the message from the table, ending with a blank line and
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (Phases 1–4 used the Haiku 4.5 line). Tick your phase document's checkboxes
  and fill in its Report in the same commit.
- Update `README.md` in the same commit when your phase changes a feature, shortcut or setting (each
  phase says whether it does).

## Launching a phase agent (supervisor)

One Sonnet 5 agent per phase (`model: "sonnet"`), in the foreground, in this worktree. Prompt:

> You are implementing Phase N of `docs/plans/v0.8-polish/`. Read `CLAUDE.md`,
> `docs/plans/v0.8-polish/README.md` and `docs/plans/v0.8-polish/<phase doc>` in full, then do
> exactly what the phase document says, ticking its checkboxes and filling in its Report. Commit
> once at the end as the README describes. Finish with the "Final message to the supervisor" from
> `docs/plans/tabs/README.md`.

After each phase, the supervisor reads the full diff against the phase document (no stray files, no
deleted or weakened tests, no scope creep), re-runs `pnpm test`, `pnpm lint`, `npx tsc --noEmit`
(and `cargo check`/`cargo test` if Rust changed), repeats the manual check with their own
screenshots in both themes, and records the outcome in the phase document's "Supervisor check".
After Phase 7, the supervisor builds the installer (`pnpm tauri build`) and checks it's named
`Markdown_0.8.0_x64-setup.exe`.

## Known issue (parked by Bilal, 2026-09-28)

During the Phase 4 check the dev app hung twice at launch (00:38 and 00:39): no app window, no
WebView2 process, `EmbeddedBrowserWebView.dll` loaded and every thread waiting. Windows logged GPU
driver resets (LiveKernelEvent 141) at 00:31 and 00:37 just before; the WebView2 browser started,
wrote its state files and exited, and the app waited for it forever. The 15 s startup watchdog from
`3a56c5f` did **not** relaunch or exit the process (no relaunched process appeared; the watchdog
thread was no longer sleeping). Likely suspects: `std::process::exit` running DLL-detach code that
blocks, or `Command::spawn` blocking. Not reproduced on demand (a fake WebView2 runtime to force the
stall was refused by the safety classifier). Parked; not part of the v0.8 phases.

## Report-back table (supervisor fills in)

| Phase | Commit | Tests before → after | Manual check | Notes |
|---|---|---|---|---|
| 1 | `1095967` | 377 → 377 | Passed (light and dark, supervisor's own screenshots) | Agent's screenshots were identical; redone |
| 2 | `670a813` | 377 → 384 | Passed (light and dark, supervisor) | Agent couldn't reach its dev app |
| 3 | `aa40701`, `fd142a2`, `3738fd8` | 384 → 423 | Passed (light and dark, supervisor) | 4 review fixes; apostrophe fixed by supervisor |
| 4 | `2d13717`, `03e4afa`, `69fa290`, `5f92c7b` | 423 → 437 | Passed (light and dark, supervisor) | Export security bug, leak, flicker fixed; row tint by supervisor; Sonnet re-review fixed a stale cursor after tab switches |
| 5 | `3e97914` | 437 → 463 | Passed (light and dark, supervisor) | Sonnet 5; swatch inside the code pill (Bilal) |
| 6 | `3bfda84` | 463 → 490 | Passed (Save dialog read by supervisor) | Sonnet 5; agent's dialog check went wrong, redone |
| 7 | `83a3ade` | 490 → 491 | Passed (agent's screenshots checked) | Sonnet 5 |
