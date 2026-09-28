# Version 1.0

Five requests from Bilal on 2026-09-28, to take the app from 0.8 to 1.0:

1. Spell checking in several languages, with red squiggly underlines.
2. A right-click menu that formats the selected text (heading, code block, quote, …).
3. A guide / user manual inside the app.
4. A rewritten README.
5. Version 1.0.

Bilal added two more on the same day: license the project under **CC0 1.0** (Phase 6), and fix
the **startup hang** parked during v0.8 as the last phase (Phase 8).

This folder splits them into eight phases. Each phase is done by its own sub-agent, **in order**, on branch `claude/app-v1-feature-plan-d05cb2` (this
worktree). A phase doesn't start until the one before it is committed and the supervisor has
checked it. Phases 1–2 were built by **Sonnet 5**; from Phase 3 on, at Bilal's request
(2026-09-28), agents are **Haiku** (`model: "haiku"`).

| Phase | Change | Document | Commit message |
|---|---|---|---|
| 1 | Windows spell-check engine (Rust) | [phase-01-spell-engine.md](phase-01-spell-engine.md) | `Add a Windows spell-check engine` |
| 2 | Squiggles in the editor + Spelling settings | [phase-02-spell-squiggles.md](phase-02-spell-squiggles.md) | `Underline misspelled words in the source editor` |
| 2b | One spelling entry per language (Bilal, follow-up) | [phase-02b-general-languages.md](phase-02b-general-languages.md) | `Show one spelling entry per language` |
| 3 | Formatting commands + shortcuts | [phase-03-formatting-commands.md](phase-03-formatting-commands.md) | `Add Markdown formatting commands and shortcuts` |
| 4 | Right-click menus | [phase-04-context-menus.md](phase-04-context-menus.md) | `Add right-click menus for the editor and preview` |
| 5 | Built-in guide | [phase-05-guide.md](phase-05-guide.md) | `Add a built-in guide` |
| 6 | CC0 licence + README rewrite | [phase-06-readme.md](phase-06-readme.md) | `License the project under CC0 1.0`, then `Rewrite the README for 1.0` |
| 7 | Version 1.0.0 and regression pass | [phase-07-version-1-0.md](phase-07-version-1-0.md) | `Bump version to 1.0.0` |
| 8 | Startup hang + installer | [phase-08-startup-hang.md](phase-08-startup-hang.md) | `Make the startup watchdog exit even when the process is stuck` (wording may change with the fix) |

Dependencies: 2 needs 1. 4 needs 2 (suggestions) and 3 (commands). 5 documents 1–4. 6 describes
everything and links the guide. 7 bumps the version. 8 is last and builds the 1.0.0 installer, so
the installer includes the startup fix.

## Research summary (why the design is what it is)

**Spell checking.** Three engines were compared:

- **WebView2's built-in checker** (`spellcheck="true"` on the editor): it uses a **single**
  language tied to the WebView2 environment's `Language` (which also changes the app's UI locale
  and needs a restart to change), ignores `lang` attributes, and exposes no API for suggestions:
  they only appear in Edge's native right-click menu, which the new formatting menu would replace.
  See WebView2Feedback [#5294](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5294),
  [#3758](https://github.com/MicrosoftEdge/WebView2Feedback/issues/3758),
  [#914](https://github.com/MicrosoftEdge/WebView2Feedback/issues/914).
- **Bundled Hunspell dictionaries** (e.g. `nspell`, or the `spellbook` crate): same results on
  every PC, but 1–5 MB per language in the installer, mixed licences (LGPL/GPL/MPL), and large
  dictionaries (Arabic) are slow to load.
- **Windows Spell Checking API** (`ISpellCheckerFactory` / `ISpellChecker`, Windows 8+): uses the
  dictionaries of the languages installed in Windows (this PC has `en-US` and `ar-SA`), costs
  nothing in the installer, supports any number of languages, and returns error offsets in UTF-16
  code units, which are exactly JavaScript string indices. The `windows` crate exposes it under
  `Win32_Globalization`. Tauri already pulls in `windows` **0.61** (via `webview2-com`), so using
  that version adds no new crate to compile. Reference crates that wrap the same API:
  [`os-spellcheck`](https://docs.rs/os-spellcheck), [`spellbound`](https://docs.rs/spellbound).

**Chosen by Bilal: the Windows spell checker.** The app draws its own squiggles (CodeMirror
decorations) and its own suggestions menu, so spelling and formatting share one right-click menu
that matches the app chrome.

**Right-click today.** Nothing in the app handles `contextmenu` outside the tab strip, so the
WebView2 default menu appears in the editor and the preview. That menu can include page items such
as *Refresh* / *Back*, which would reload the webview and lose unsaved work (CLAUDE.md §4). Phase 4
replaces it everywhere except plain `<input>`/`<textarea>` fields. (Phase 4 records exactly which
items the current menu shows before changing it.)

**Guide.** A Markdown file bundled as a Tauri resource and opened like any other file: it shows
off the renderer (tables, maths, Mermaid), and Find, the outline, presets and printing all work
on it for free.

## Decisions made by Bilal (don't change or re-discuss)

- **Spell-check engine:** the Windows Spell Checking API, called from Rust.
- **Languages:** Settings → General → Spelling has an on/off toggle and a **checklist** of the
  languages Windows can check. **All ticked languages are checked at once**: a word is only
  underlined if *every* ticked language rejects it (mixed English/Arabic notes work).
- **Right-click menu in the source editor, full version:** spelling suggestions, *Add to
  dictionary* and *Ignore* at the top (only on a misspelled word); Cut / Copy / Paste / Select all;
  then formatting: a **Heading** submenu (Heading 1–6, Paragraph), Bold, Italic, Strikethrough,
  Inline code, Link, Code block, Quote, Bulleted list, Numbered list, Task list, Horizontal rule.
- **Formatting shortcuts** are added too: `Ctrl+B`, `Ctrl+I`, `Ctrl+K`, and heading shortcuts
  (see the supervisor decision below for the exact keys).
- **Guide:** a bundled `Guide.md`, opened as a tab (or window, per *Open files in*) from a new
  **Help** toolbar button, **F1**, and a link on the start screen.

## Supervisor decisions (small; Bilal can veto)

- **Heading shortcuts are `Ctrl+Shift+1…6`, and `Ctrl+Shift+0` for Paragraph**, not `Ctrl+Alt+1…6`
  as first suggested. On Windows `Ctrl+Alt` *is* `AltGr`, and German, French, Polish and many
  other layouts type `{ [ ] } @ ² ³` with `AltGr+digit`; binding those would stop people typing
  braces. `Ctrl+1…9` are tab switching and `Ctrl+0` is zoom reset, so plain `Ctrl+digit` is taken.
- **Where spell check runs:** only in the source editor (Source view and the editor side of Split).
  The formatted view is not editable, so it has no squiggles.
- **What is not checked:** fenced and indented code, inline code, URLs and autolinks, link and
  image destinations, reference definitions, HTML tags, maths (`$…$`, `$$…$$`), YAML front
  matter, and HEX colour codes.
- **Default languages:** until the user ticks something, the app checks the Windows display
  language (`navigator.language`, matched to the closest supported tag), or `en-US` if that isn't
  supported. The setting stores an explicit list once the user changes it.
- **Spell check is on by default.**
- **Personal dictionary:** *Add to dictionary* stores the word in the app's own settings
  (`spellWords`), not in the shared Windows dictionary, so it's visible and removable in Settings
  and never touches other apps. *Ignore* lasts until the app closes (all tabs in the window).
- **Right-click placement:** clicking inside the selection keeps it; clicking outside moves the
  cursor to the click, like Word and VS Code. The **Menu** key and **Shift+F10** open the menu at
  the cursor.
- **Inline formats with no selection** (Bold, Italic, Strikethrough, Inline code, Link) apply to the
  word under the cursor; with no word there, they insert the empty markers with the cursor between
  them. Applying a format that's already there removes it (toggle). **Block formats** (headings,
  quote, lists, code block) apply to every line the selection touches.
- **Link** is a plain menu item without `…` (no dialog opens): it produces `[text](url)` and selects
  `url` so it can be typed or pasted over.
- **Formatted-view menu:** Copy and Select all (the preview only). Split view: each pane gets its
  own menu.
- **Guide file:** `src-tauri/resources/guide/Guide.md`, bundled as a resource. It opens as a
  normal file tab, but **it's never added to recent files**, and **Save (Ctrl+S) on it always
  goes to Save as**, so the installed copy can't be overwritten. No screenshots inside the guide
  (it would go stale with every preset); it names buttons by their tooltips.
- **README:** user-facing first (what it is, screenshots in light and dark, install, features,
  spell check, shortcuts, where the guide is), developer section after. Screenshots live in
  `docs/images/`.
- **Licence (Bilal):** CC0 1.0 Universal. `LICENSE` holds the official legal code; `package.json`
  and `Cargo.toml` say `CC0-1.0`. Bundled fonts and dependencies keep their own licences, and the
  README says so.
- **1.0 release check:** Phase 7 runs every fixture in both themes and checks `huge.md` typing
  speed with spell check on. Phase 8 builds `Markdown_1.0.0_x64-setup.exe` after the startup fix.
  **Installing** it over Bilal's installed 0.8 is only done with his OK.

## Rules for every agent

Follow the "Rules for every agent" and "Definition of done" sections of
[`../review-followups/README.md`](../review-followups/README.md), which point to the tabs and
save-recent-polish rules too. They all apply here. In particular:

- Read `CLAUDE.md` in full, then this README, then your phase document, then **every file your
  phase touches** before you edit it.
- **Do only your phase.** Anything else you notice goes in your Report.
- **Never delete, rewrite or weaken existing tests.** Only add. Write down the `pnpm test` count
  before and after (it was **491** after v0.8).
- Every new pure helper gets unit tests next to it. Every visible change is checked in the running
  app in **light and dark**, with screenshots you open and describe honestly. Two screenshots that
  are byte-identical are not a light/dark check.
- Bilal's installed app may be running. It shares `settings.json` and the single-instance lock with
  dev builds. Launch the dev app with `--new-window` and your own `WEBVIEW2_USER_DATA_FOLDER`,
  change settings for checks with `{ persist: false }`, and back up
  `%APPDATA%\com.bilal.markdown-viewer\settings.json`, `presets.json` and `.window-state.json` to
  your scratchpad first. Afterwards restore **only** what your checks changed (e.g. `recentFiles`);
  never copy a whole backup over the live file.
- **Never stop processes by path pattern or name** (that would close Bilal's installed app). Stop
  only process IDs you started. Never edit or delete files you didn't create (including the
  supervisor's scratchpad scripts).
- `--new-window` can't be passed through `pnpm tauri dev --` (cargo rejects it). Launch the dev
  app like this instead: `cargo build` in `src-tauri`, start Vite with `pnpm dev` (background),
  then start `src-tauri\target\debug\markdown-viewer.exe --new-window` with
  `WEBVIEW2_USER_DATA_FOLDER` set to a folder in your scratchpad and
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`. Stop the exe and Vite by
  the PIDs/task you started.
- Open **copies** of fixtures from your scratchpad, never the repo files.
- Backslashes (Windows paths, regexes, TeX) only through the Write/Edit tools. Non-ASCII
  characters (`’`, `…`, `←`, Arabic) also through Write/Edit, and check them afterwards with
  `Select-String` or by reading the file back.
- Synthetic pointer events need `pointerId: 1`. A synthetic `contextmenu` event needs `clientX`,
  `clientY` and `button: 2`.
- Commit once, with the message from the table, ending with a blank line and
  `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` (Phases 1–2 used the Sonnet 5
  line). Tick your phase document's
  checkboxes and fill in its Report in the same commit.
- Update `README.md` in the same commit when your phase changes a feature, shortcut or setting
  (Phases 1–5; Phase 6 rewrites it anyway).

## Launching a phase agent (supervisor)

One Haiku agent per phase (`model: "haiku"`), in this worktree. Prompt:

> You are implementing Phase N of `docs/plans/v1.0/`. Read `CLAUDE.md`,
> `docs/plans/v1.0/README.md` and `docs/plans/v1.0/<phase doc>` in full, then do exactly what the
> phase document says, ticking its checkboxes and filling in its Report. Commit once at the end as
> the README describes. Finish with the "Final message to the supervisor" from
> `docs/plans/tabs/README.md`.

After each phase, the supervisor reads the full diff against the phase document (no stray files, no
deleted or weakened tests, no scope creep), re-runs `pnpm test`, `pnpm lint`, `npx tsc --noEmit`
(and `cargo check`/`cargo test` if Rust changed), repeats the manual check with their own
screenshots in both themes, and records the outcome in the phase document's "Supervisor check".

## Report-back table (supervisor fills in)

| Phase | Commit | Tests before → after | Manual check | Notes |
|---|---|---|---|---|
| 1 | `c3aedbe`, `81e3edc` | 491 → 495 (Rust 44 → 54) | Passed (CDP invoke checks, supervisor) | Integration test didn't init COM; fixed |
| 2 | `87db9f5`, `bcf7f9d`, `f81f1a5`, `20ee8e5` | 495 → 555 | Passed (light and dark, supervisor) | 3 review rounds: stale replies, Ignore refresh, shared cache, last language, Settings layout, stable order |
| 2b | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
