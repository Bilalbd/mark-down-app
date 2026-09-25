# Tabs: phase documents

The overall design is in [`../tabs.md`](../tabs.md). This folder splits it into one document per
phase. Phase 4 of the overall plan is split into 4a (store logic) and 4b (wiring), and the
phase documents take precedence over `tabs.md` where they're more specific (for example, the
`openFilesIn` key is added in Phase 5 because the tab strip needs it). Each phase is done by a
separate agent, in order. A phase doesn't start until the one
before it is committed.

| Phase | Document | Commit message |
|---|---|---|
| 1 | [phase-1-rules.md](phase-1-rules.md) | `Allow tabs: update project rules for tabbed documents` |
| 2 | [phase-2-watcher.md](phase-2-watcher.md) | `Let the file watcher track several files` |
| 3 | [phase-3-helpers.md](phase-3-helpers.md) | `Add pure helpers for tab bookkeeping` |
| 4a | [phase-4a-store.md](phase-4a-store.md) | `Add a tabs store that swaps the active document` |
| 4b | [phase-4b-wiring.md](phase-4b-wiring.md) | `Wire tab switching into the editor, preview and app` |
| 5 | [phase-5-tabstrip.md](phase-5-tabstrip.md) | `Show open documents as tabs in the title bar` |
| 6 | [phase-6-setting.md](phase-6-setting.md) | `Add the "Open files in" setting and route opens through it` |
| 7 | [phase-7-single-instance.md](phase-7-single-instance.md) | `Open files from Explorer in a tab or a new window` |
| 8 | [phase-8-docs.md](phase-8-docs.md) | `Document tabs and add tab fixtures` |

---

## Rules for every phase agent

Read these before you start. They apply on top of `CLAUDE.md`.

1. **Read first:** `CLAUDE.md` (all of it), `docs/plans/tabs.md` §0 (context and decisions), then
   your phase document. Read every file the phase touches before editing it.
2. **Do only your phase.** Don't start the next phase, and don't refactor or reformat anything the
   phase doesn't list. If you notice a problem elsewhere, write it in your Report section.
3. **Tick the checkboxes** in your phase document as you finish each task (`- [ ]` → `- [x]`),
   and fill in the **Report** section at the bottom. The phase document is committed together
   with the code.
4. **Verify before committing.** Run each command in the phase's Verify list and read the output.
   Don't commit while anything fails. If you can't make something pass, **stop, don't commit**,
   and explain in your final message what fails, with the error output.
5. **Commit once**, at the end, with the message from the table above. Stage only the files you
   changed (`git add <paths>`, never `git add -A` blindly; check `git status` first). End the
   commit message with a blank line and:
   `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>`
6. **Never** push, open a PR, amend or rebase existing commits, use `git stash`, or pass
   `--no-verify`.
7. **Backslashes:** the Bash tool turns `\\` into `\` on this machine. Write any file content with
   backslashes (Windows paths in tests, regexes) using the Write/Edit tools, never with heredocs,
   `echo` or `sed`.
8. **Package manager:** pnpm only. Don't add dependencies unless your phase says so.
9. **No `console.log`, no commented-out code, no `any`.** Prettier style: single quotes, semicolons,
   trailing commas, width 100. Run `pnpm format` before committing (it only touches `src/`).
   Then `git diff --stat` and revert any file you didn't intend to change.
10. **British spelling** in UI text and comments ("colour", "normalise"); American in identifiers.

### Running the dev app (only when your phase asks for a manual check)

- Check first that nothing else is using the ports:
  `Get-NetTCPConnection -LocalPort 1420,9222 -ErrorAction SilentlyContinue`. If anything is
  listening, **don't kill it** (another session may own it). Skip the manual check and say so
  in your Report.
- Start it with the PowerShell tool and `run_in_background: true`:
  `.\scripts\dev.ps1 "C:\full\path\to\fixture.md"` (use an **absolute** path). The first build can
  take several minutes.
- Poll until it's ready: `node scripts/cdp.mjs eval "document.title"`. Retry every ~20 s, for up to
  ~10 minutes.
- Drive it with `node scripts/cdp.mjs eval "<js>"` or `eval-file <file.js>`. For multi-statement
  scripts, write the file in your scratchpad and end it with an explicit `return {...}`. The stores
  are on `window.__mdv`.
- Screenshots: `node scripts/cdp.mjs screenshot <scratchpad>\name.png`, then look at it with the
  Read tool.
- **Always stop it when you're done**, even if something failed:
  `Stop-Process -Name markdown-viewer -ErrorAction SilentlyContinue`, then stop your background
  task, then free port 1420:
  `Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue }`
  (only if you started it).

### Commands

| What | Command (PowerShell, repo root) |
|---|---|
| Unit tests | `pnpm test` |
| Lint | `pnpm lint` |
| Typecheck | `npx tsc --noEmit` |
| Rust | `$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path; cd src-tauri; cargo check; cargo test; cd ..` |

### Final message to the supervisor

End with: the commit hash (or "not committed" and why), the Verify results (pass/fail per
command), what you checked in the app (or why you skipped it), and anything you did differently from
the phase document.
