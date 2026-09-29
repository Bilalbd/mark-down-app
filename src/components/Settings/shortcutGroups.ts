export interface ShortcutGroup {
  title: string;
  rows: [keys: string, action: string][];
}

/** Every shortcut the app binds, grouped as in the README, for the Shortcuts page. Keep this in
 * step with `App.tsx`, the README and the guide. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Files',
    rows: [
      ['Ctrl+N', 'New file'],
      ['Ctrl+O', 'Open file'],
      ['Ctrl+S', 'Save'],
      ['Ctrl+Shift+S', 'Save as'],
    ],
  },
  {
    title: 'Tabs',
    rows: [
      ['Ctrl+T', 'New tab'],
      ['Ctrl+W', 'Close tab'],
      ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous tab'],
      ['Ctrl+PageDown / Ctrl+PageUp', 'Next / previous tab'],
      ['Ctrl+1 … Ctrl+9', 'Go to tab'],
      ['Ctrl+Shift+← / Ctrl+Shift+→', 'Move tab left / right'],
    ],
  },
  {
    title: 'Views',
    rows: [
      ['Ctrl+E', 'Toggle formatted / source'],
      ['Ctrl+Shift+E', 'Toggle split view'],
      ['Ctrl+\\', 'Toggle outline'],
      ['Ctrl+F', 'Find'],
      ['Ctrl+,', 'Settings'],
      ['F1', 'Guide'],
      ['Ctrl+= / Ctrl+− / Ctrl+0 / Ctrl+wheel', 'Zoom preview'],
    ],
  },
  {
    title: 'Editing (Source view)',
    rows: [
      ['Ctrl+B', 'Bold'],
      ['Ctrl+I', 'Italic'],
      ['Ctrl+K', 'Link'],
      ['Ctrl+Shift+1 … Ctrl+Shift+6', 'Heading 1–6 (press again for a paragraph)'],
    ],
  },
];
