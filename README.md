# Markdown

A simple, fast Markdown viewer and editor for Windows. Double-click a `.md` file and it opens
rendered; flip to Source to edit; the outline keeps you oriented.

Built with Tauri 2 (Rust + WebView2), React, CodeMirror 6, markdown-it, Shiki, KaTeX and Mermaid.

## Features

- **Tabs** — open multiple files as tabs in one window. Drag files from Explorer, use `Ctrl+O` to
  open several at once, or open from recent files. Each tab keeps its own view mode (Formatted /
  Source / Split), scroll position and undo history. A file already open in a tab is focussed
  instead of opened again. When the app is already running and you open a `.md` file from
  Explorer (double-click or *Open With*), it opens as a tab in the running window which comes to
  the front (**New tab** mode) or in a separate window (**New window** mode). Configure the
  behaviour in **Settings → General** (**Open files in:** New tab / New window, default New tab).
- **Formatted / Source / Split** views (`Ctrl+E`, `Ctrl+Shift+E`) with the source line kept in
  place when switching, and bidirectional scroll sync in Split.
- **Editing** in Source mode with markdown syntax highlighting, `Ctrl+S` to save, a dirty
  indicator in the title bar and a Save / Don't save / Cancel guard on close.
- Reads and preserves UTF-8 (with or without BOM) and UTF-16 (LE/BE) files, and CRLF/LF line
  endings, round-tripping each on save; a file with invalid-UTF-8 bytes asks before saving
  over them.
- **Outline** sidebar (`Ctrl+\`) — collapsible, resizable, click to jump, follows your scroll.
- **Styling presets** — GitHub, Obsidian-like, Claude-like, Boulayla and Sequoia built in. Every font, size, spacing
  and colour (separately for light and dark) is editable in Settings (`Ctrl+,`); presets can be
  copied, renamed, imported and exported as JSON, and each has a custom-CSS slot. Inter, Open Sans
  and JetBrains Mono (used by Sequoia/Obsidian/Boulayla) are bundled so they render correctly even
  though Windows doesn't ship them.
- **Light / dark / follow-Windows** app theme.
- GFM tables, task lists, footnotes, autolinks; fenced code with Shiki highlighting;
  **KaTeX** math (`$…$`, `$$…$$`); **Mermaid** diagrams.
- **Live reload** when the file changes on disk (asks first if you have unsaved edits).
- **Block remote images** (off by default, in Settings) stops `http(s)` image sources from
  loading in the preview, for documents from sources you don't fully trust.
- **Find** (`Ctrl+F`) in both views.
- **Links** in the preview: `http(s)`/`mailto:` open externally; a relative link to another
  Markdown file opens it in the app (with the usual unsaved-changes prompt); a relative link
  to anything else reveals it in File Explorer; in-page `#anchor` links scroll to the heading.
- **Export** as a standalone HTML file, or print / save as PDF. The exported HTML links the
  KaTeX stylesheet from a CDN (needs internet to render math when opened) and falls back to
  system fonts for Inter/Open Sans/JetBrains Mono, since the bundled font files aren't embedded.
- Registers itself for `.md` / `.markdown` so *Open with* and double-click work.

**Note:** Open tabs aren't restored when the app restarts: it starts on the start screen, or with
the file it was opened with.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+N | New file |
| Ctrl+O | Open file |
| Ctrl+S | Save |
| Ctrl+T | New tab |
| Ctrl+W | Close tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Ctrl+1 … Ctrl+9 | Go to tab |
| Ctrl+E | Toggle formatted / source |
| Ctrl+Shift+E | Toggle split view |
| Ctrl+\ | Toggle outline |
| Ctrl+F | Find |
| Ctrl+, | Settings |
| Ctrl+= / Ctrl+− / Ctrl+0 | Zoom preview |

## Development

Prerequisites: Node 20+, pnpm, Rust (stable, MSVC toolchain), Visual Studio Build Tools with the
*Desktop development with C++* workload, WebView2 runtime (ships with Windows 11).

```bash
pnpm install
pnpm tauri dev                 # run the app
pnpm test                      # unit tests (vitest)
pnpm lint                      # eslint
pnpm tauri build               # NSIS installer in src-tauri/target/release/bundle/nsis
```

`scripts/dev.ps1 [file.md]` launches the dev app with WebView2 remote debugging on port 9222;
`node scripts/cdp.mjs eval "<js>" | eval-file <file> | screenshot <out.png> | pdf <out.pdf>` drives it.
In dev builds the stores are exposed on `window.__mdv`.

Test documents live in `fixtures/`, including `fixtures/tabs/` for tab-specific testing.

## Layout

```
src/
  markdown/    render pipeline: markdown-it + plugins, Shiki, KaTeX, Mermaid, DOMPurify
  store/       zustand stores: document, settings, style presets, transient view state, tabs
  components/  TitleBar, Toolbar, Preview, Editor (CodeMirror), Outline, Split, Find, Settings,
               Tabs (TabStrip)
  styles/      app chrome theme, preset → CSS variable mapping, built-in presets
  lib/         Tauri invoke wrappers, shortcuts, scroll-sync maths, export, tab helpers,
               editor cache per tab
src-tauri/     Rust shell: file read/write, asset scope, file watcher (multiple files)
```

Settings and presets are stored in `%APPDATA%\com.bilal.markdown-viewer\`.

Icon sources: `src-tauri/icons/markdown_icon.svg` (app icon, title bar, favicon) and
`src-tauri/icons/markdown_file_icon.svg` (the `.md` file-type icon, rendered to `markdown-file.ico`
and registered by `src-tauri/nsis/hooks.nsh` at install time).
