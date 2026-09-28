import {
  Bold,
  BookPlus,
  ClipboardPaste,
  Code,
  Copy,
  EyeOff,
  Heading,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Scissors,
  SquareCode,
  Strikethrough,
  TextQuote,
} from 'lucide-react';
import type { MenuEntry } from '@/components/ContextMenu/ContextMenu';

/** At most this many spelling suggestions are shown, the top one bold - see the mock-up in
 * `docs/plans/v1.0/phase-04-context-menus.md`. */
export const MAX_SUGGESTIONS = 5;

export interface EditorMenuContext {
  /** The misspelled word under the click, or `null` when it landed on correctly-spelled text
   * (or spell check found nothing there) - the suggestions/dictionary items only show up top. */
  misspelling: { word: string } | null;
  /** Resolved suggestions for `misspelling.word`, already capped by the caller's 150ms wait.
   * Ignored when `misspelling` is `null`. */
  suggestions: string[];
  hasSelection: boolean;
}

const HEADING_SUBMENU: MenuEntry[] = [
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    id: `heading-${level}`,
    label: `Heading ${level}`,
    shortcut: `Ctrl+Shift+${level}`,
    ariaKeyShortcuts: `Control+Shift+${level}`,
  })),
  // No shortcut: Ctrl+Shift+0 was dropped after a real press froze the page (Phase 3).
  { id: 'heading-0', label: 'Paragraph' },
];

/** Builds the source-editor right-click menu's item model from the click/cursor context - pure
 * and DOM-free, so it's tested without mounting CodeMirror. Action ids match the `case`s in
 * `SourceEditor`'s menu handler; a suggestion's id is `suggestion-<index>` into `suggestions`. */
export function buildEditorMenu(ctx: EditorMenuContext): MenuEntry[] {
  const items: MenuEntry[] = [];

  if (ctx.misspelling) {
    const top = ctx.suggestions.slice(0, MAX_SUGGESTIONS);
    if (top.length === 0) {
      items.push({ id: 'no-suggestions', label: 'No suggestions', disabled: true });
    } else {
      top.forEach((word, i) => {
        items.push({ id: `suggestion-${i}`, label: word, bold: i === 0 });
      });
    }
    items.push({ id: 'add-to-dictionary', label: 'Add to dictionary', icon: BookPlus });
    items.push({ id: 'ignore', label: 'Ignore', icon: EyeOff });
    items.push({ id: 'sep-suggestions', separator: true });
  }

  items.push({
    id: 'cut',
    label: 'Cut',
    icon: Scissors,
    shortcut: 'Ctrl+X',
    ariaKeyShortcuts: 'Control+X',
    disabled: !ctx.hasSelection,
  });
  items.push({
    id: 'copy',
    label: 'Copy',
    icon: Copy,
    shortcut: 'Ctrl+C',
    ariaKeyShortcuts: 'Control+C',
    disabled: !ctx.hasSelection,
  });
  items.push({
    id: 'paste',
    label: 'Paste',
    icon: ClipboardPaste,
    shortcut: 'Ctrl+V',
    ariaKeyShortcuts: 'Control+V',
  });
  items.push({
    id: 'select-all',
    label: 'Select all',
    shortcut: 'Ctrl+A',
    ariaKeyShortcuts: 'Control+A',
  });
  items.push({ id: 'sep-clipboard', separator: true });

  items.push({ id: 'heading', label: 'Heading', icon: Heading, submenu: HEADING_SUBMENU });
  items.push({
    id: 'bold',
    label: 'Bold',
    icon: Bold,
    shortcut: 'Ctrl+B',
    ariaKeyShortcuts: 'Control+B',
  });
  items.push({
    id: 'italic',
    label: 'Italic',
    icon: Italic,
    shortcut: 'Ctrl+I',
    ariaKeyShortcuts: 'Control+I',
  });
  items.push({ id: 'strikethrough', label: 'Strikethrough', icon: Strikethrough });
  items.push({ id: 'inline-code', label: 'Inline code', icon: Code });
  items.push({
    id: 'link',
    label: 'Link',
    icon: Link,
    shortcut: 'Ctrl+K',
    ariaKeyShortcuts: 'Control+K',
  });
  items.push({ id: 'sep-inline', separator: true });

  items.push({ id: 'code-block', label: 'Code block', icon: SquareCode });
  items.push({ id: 'quote', label: 'Quote', icon: TextQuote });
  items.push({ id: 'list-bullet', label: 'Bulleted list', icon: List });
  items.push({ id: 'list-ordered', label: 'Numbered list', icon: ListOrdered });
  items.push({ id: 'list-task', label: 'Task list', icon: ListTodo });
  items.push({ id: 'horizontal-rule', label: 'Horizontal rule', icon: Minus });

  return items;
}
