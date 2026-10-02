# Changelog

Every change to the app and to how it's built is logged here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

- One line per change, saying what's different for someone who uses the app ("Spell check skips
  code blocks", not "Changed spellcheck.ts"). Name the setting, shortcut or view when there is
  one.
- **Added** for new features, **Changed** for changes to existing behaviour, **Fixed** for bug
  fixes, **Removed** for things taken out, **Development** for tooling, tests, docs and process
  that users don't see.
- A larger feature or a tricky bug fix also gets a short note in [`docs/changes/`](docs/changes/),
  linked from its line.
- New entries go under **Unreleased**. A release renames that heading to the version and date.

## [Unreleased]

## [1.1.0] - 2026-10-02

### Added

- 16 more built-in fonts (19 in all: sans, serif, heading, code and Arabic), bundled so they work
  offline.
- Any of about 2,000 Google Fonts can be picked in Settings → Appearance. The app downloads a font
  once, from Fontsource rather than Google, and it then works offline. To remove a downloaded font,
  hover it in the font list and click ×, or highlight it and press Delete.
  ([note](docs/changes/2026-10-02-font-picker.md))

### Changed

- Built-in fonts include only Latin and Arabic characters, keeping the installer small; other
  scripts use a system font.
- Fonts in Settings → Appearance are chosen from a searchable list of built-in fonts, fonts
  installed on this PC and Google Fonts, each shown in its own typeface; a custom CSS font list is
  still available. ([note](docs/changes/2026-10-02-font-picker.md))
- The Solarized preset has darker body text in light mode and brighter text in dark mode for
  easier reading, with slightly tighter line spacing and a wider page (800px).
- Self-contained HTML export also embeds the built-in and downloaded Google fonts the preset
  uses, so it looks the same on any computer; installed fonts are never embedded.

### Fixed

- A tab's unsaved-changes dot now sits before the file name and shows on every unsaved tab,
  including the active one, instead of being hidden behind the close button.
- The active tab's bottom corners are now rounded on both sides when it's the first or last tab,
  not only when it sits between two others.

### Development

- Plan phases handed to sub-agents use a lean `implementer` agent type that never launches the
  app; the running-app checks moved to the supervisor, batched per group of phases.
  ([note](docs/changes/2026-09-30-agent-token-use.md))
- Reusable running-app checks in `scripts/checks/`: launch and stop with a settings backup and
  restore, plus checks for the fixture sweep, formatting shortcuts, right-click menus, the guide
  and the Settings pages. ([note](docs/changes/2026-09-30-check-scripts.md))
- A running-app font check (`scripts/checks/fonts.mjs`): every built-in font loads only its Latin
  (and Arabic) files and renders, and the font picker's groups, search, keyboard use, filters,
  custom mode and preset fonts work, with screenshots in light and dark. `fonts-google.mjs` checks
  Google Fonts step by step: download with progress, registration at startup, offline (through an
  unreachable `HTTPS_PROXY`), removing (also from the font list), importing and the fonts a
  self-contained export embeds; its cleanup leaves your own downloaded fonts alone.
- `scripts/checks/stop.ps1` also stops the copy the startup watchdog relaunches after a slow
  first start, which used to keep running and block the next launch.
- `scripts/checks/launch.ps1` warms a freshly started Vite before launching the app, so the
  first page load no longer outlasts the startup watchdog and makes the app relaunch itself.
- This changelog, `docs/changes/`, and a hook that reminds Claude Code sessions to log each
  commit.

## [1.0.0] - 2026-09-29

The 1.0 release, after 0.8. Versions before 1.0.0 weren't logged here; see the git history.

### Added

- Spell check in the Source editor using the languages installed in Windows, with red wavy
  underlines, one entry per language in Settings → Editor → Spelling, and a word flagged only when
  every ticked language rejects it.
- Formatting commands and shortcuts: `Ctrl+B`, `Ctrl+I`, `Ctrl+K`, and `Ctrl+Shift+1…6` for
  headings (press a heading's shortcut again to turn it back into a paragraph).
- Right-click menus: formatting, clipboard actions and spelling suggestions (Add to dictionary,
  Ignore) in the Source editor, opened by mouse, the Menu key or `Shift+F10`; Copy and Select all
  in the formatted view.
- A built-in guide (`F1`, the toolbar's Guide button, or the start screen's link), shown in its
  own read-only window.
- An optional highlight (Settings → General → Layout) that tints the formatted block holding the
  source cursor in Split view, across the full width.

### Changed

- Settings is arranged into five pages: General, Editor, Appearance, Shortcuts and About.
- Submenus stay open while the pointer moves towards them.
- The README was rewritten for 1.0, and the project is licensed under CC0 1.0.

### Fixed

- A start that got stuck before the window appeared now recovers on its own, and keeps the files
  that were being opened.

### Removed

- The `Ctrl+Shift+0` paragraph shortcut: Windows reserves it as an input-language hotkey.
