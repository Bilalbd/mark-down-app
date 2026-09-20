# Markdown

A simple, fast Markdown viewer and editor for Windows. Double-click a `.md` file and it opens
rendered; flip to Source to edit; the outline keeps you oriented.

Built with Tauri 2 (Rust + WebView2), React, CodeMirror 6, markdown-it, Shiki, KaTeX and Mermaid.

## Features

- **Formatted / Source / Split** views (`Ctrl+E`, `Ctrl+Shift+E`) with the source line kept in
  place when switching, and bidirectional scroll sync in Split.
- **Editing** in Source mode with markdown syntax highlighting, `Ctrl+S` to save, a dirty
  indicator in the title bar and a Save / Don't save / Cancel guard on close.
- **Outline** sidebar (`Ctrl+\`) — collapsible, resizable, click to jump, follows your scroll.
- **Styling presets** — GitHub, Obsidian-like, Claude-like and Boulayla built in. Every font, size, spacing
  and colour (separately for light and dark) is editable in Settings (`Ctrl+,`); presets can be
  copied, renamed, imported and exported as JSON, and each has a custom-CSS slot.
- **Light / dark / follow-Windows** app theme.
- GFM tables, task lists, footnotes, autolinks; fenced code with Shiki highlighting;
  **KaTeX** math (`$…$`, `$$…$$`); **Mermaid** diagrams.
- **Live reload** when the file changes on disk (asks first if you have unsaved edits).
- **Find** (`Ctrl+F`) in both views.
- **Export** as a standalone HTML file, or print / save as PDF.
- Registers itself for `.md` / `.markdown` so *Open with* and double-click work.

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

Test documents live in `fixtures/`.

## Layout

```
src/
  markdown/    render pipeline: markdown-it + plugins, Shiki, KaTeX, Mermaid, DOMPurify
  store/       zustand stores: document, settings, style presets, transient view state
  components/  TitleBar, Toolbar, Preview, Editor (CodeMirror), Outline, Split, Find, Settings
  styles/      app chrome theme, preset → CSS variable mapping, built-in presets
  lib/         Tauri invoke wrappers, shortcuts, scroll-sync maths, export
src-tauri/     Rust shell: file read/write, asset scope, file watcher
```

Settings and presets are stored in `%APPDATA%\com.bilal.markdown-viewer\`.
