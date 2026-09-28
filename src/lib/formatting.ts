import {
  EditorState,
  EditorSelection,
  type ChangeSpec,
  type TransactionSpec,
} from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

/** Remove ATX heading marker (# to ######) from a line, returning the line without the marker or the same line if no marker. */
function removeHeadingMarker(line: string): string {
  const trimmed = line.trimStart();
  const match = /^#+\s+/.exec(trimmed);
  if (!match) return line;
  const leading = line.length - line.trimStart().length;
  return line.slice(0, leading) + trimmed.slice(match[0].length);
}

/** Check if a line starts with a blockquote or list marker before the heading. */
function getLinePrefix(line: string): string {
  const trimmed = line.trimStart();
  const leading = line.slice(0, line.length - trimmed.length);
  let prefix = leading;
  let rest = trimmed;

  // Check for blockquote
  if (rest.startsWith('> ')) {
    prefix += '> ';
    rest = rest.slice(2);
  }

  // Check for list marker
  const listMatch = /^([-*+]|\d+[.)]) /.exec(rest);
  if (listMatch) {
    prefix += listMatch[0];
    rest = rest.slice(listMatch[0].length);
  }

  return prefix;
}

/** Get just the text after the prefix (blockquote and list markers). */
function getLineSuffix(line: string): string {
  const prefix = getLinePrefix(line);
  return line.slice(prefix.length);
}

/** Set heading level for a line, removing existing marker and adding the new one. Prefix (blockquote/list) is preserved. */
function setLineHeading(line: string, level: number): string {
  const prefix = getLinePrefix(line);
  let suffix = getLineSuffix(line);

  // Remove existing heading marker
  suffix = removeHeadingMarker(suffix);

  // Add new heading marker if level > 0 and the suffix is not blank
  if (level > 0 && suffix.trim() !== '') {
    suffix = '#'.repeat(level) + ' ' + suffix;
  }

  return prefix + suffix;
}

/** Check if a line starts with the given heading level. */
function hasHeadingLevel(line: string, level: number): boolean {
  if (level === 0) {
    // Paragraph: no heading marker after prefix
    const suffix = getLineSuffix(line);
    return !/^#+\s/.test(suffix);
  }
  const suffix = getLineSuffix(line);
  const markerPattern = new RegExp(`^#{${level}}\\s`);
  return markerPattern.test(suffix);
}

/** Set heading for all lines in the selection, allowing toggle. */
export function setHeading(
  state: EditorState,
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): TransactionSpec | null {
  const spec = state.changeByRange((range) => {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    const changes: ChangeSpec[] = [];

    for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo++) {
      const line = state.doc.line(lineNo);
      const text = line.text;

      // Skip blank lines
      if (text.trim() === '') continue;

      // Check if all touched non-blank lines already have this level
      const hasLevel = hasHeadingLevel(text, level);

      const newText = setLineHeading(text, hasLevel ? 0 : level);
      if (newText !== text) {
        changes.push({ from: line.from, to: line.to, insert: newText });
      }
    }

    return { changes, range: EditorSelection.range(range.from, range.to) };
  });

  if (!spec.changes || spec.changes.length === 0) return null;

  return { ...spec, userEvent: 'input.format' };
}

/** Find the longest run of the marker character in the text. */
function longestRun(text: string, char: string): number {
  let max = 0;
  let current = 0;
  for (const c of text) {
    if (c === char) {
      current++;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max;
}

/** Detect word characters (letters, digits, underscore, apostrophe). */
function isWordChar(c: string): boolean {
  return /[\p{L}\p{N}_']/u.test(c);
}

/** Toggle marker wrapping (e.g., ** for bold). Handles selection on word, multi-line, etc. */
function toggleMarker(state: EditorState, marker: string, isCode = false): TransactionSpec | null {
  const spec = state.changeByRange((range) => {
    const { from, to } = range;
    let text = state.doc.sliceString(from, to);

    if (text === '') {
      // Empty selection: find the word under cursor or insert pair
      const line = state.doc.lineAt(from);
      const lineText = line.text;
      const colInLine = from - line.from;

      // Find word boundaries using word character detection
      let wordStart = colInLine;
      let wordEnd = colInLine;

      // Extend backwards to find start of word
      while (wordStart > 0 && isWordChar(lineText[wordStart - 1])) {
        wordStart--;
      }

      // Extend forwards to find end of word
      while (wordEnd < lineText.length && isWordChar(lineText[wordEnd])) {
        wordEnd++;
      }

      if (wordStart < wordEnd && wordStart <= colInLine && colInLine <= wordEnd) {
        // Word found under cursor
        const word = lineText.slice(wordStart, wordEnd);
        const start = line.from + wordStart;
        const end = line.from + wordEnd;
        const wrapped = marker + word + marker;
        return {
          changes: [{ from: start, to: end, insert: wrapped }],
          range: EditorSelection.range(start, start + wrapped.length),
        };
      } else {
        // No word: insert pair with cursor between
        const pair = marker + marker;
        return {
          changes: [{ from, to, insert: pair }],
          range: EditorSelection.cursor(from + marker.length),
        };
      }
    }

    // Non-empty selection: check for unwrapping or wrapping
    const trimmedText = text.trimStart();
    const leadingSpaces = text.length - trimmedText.length;
    const trailingText = trimmedText.trimEnd();
    const trailingSpaces = trimmedText.length - trailingText.length;

    // Check if wrapped: markers are right at the boundaries (not doubled)
    const contentLength = trailingText.length - marker.length * 2;
    const isWrapped =
      trailingText.startsWith(marker) &&
      trailingText.endsWith(marker) &&
      contentLength > 0 &&
      trailingText[marker.length] !== marker[0];

    let newText: string;
    if (isWrapped) {
      // Unwrap
      newText =
        ' '.repeat(leadingSpaces) +
        trailingText.slice(marker.length, -marker.length) +
        ' '.repeat(trailingSpaces);
    } else {
      // Wrap - check for multi-line
      const lines = text.split('\n');
      const hasMultipleLines = lines.length > 1;

      if (hasMultipleLines) {
        // Multi-line: apply to each non-empty line separately
        const resultLines = lines.map((line) => {
          if (line.trim() === '') return line;
          const leading = line.length - line.trimStart().length;
          const trailing = line.length - line.trimEnd().length;
          const spaces = line.slice(0, leading);
          const content = line.slice(leading, line.length - trailing);
          const trailingSpaces = line.slice(line.length - trailing);
          return spaces + marker + content + marker + trailingSpaces;
        });
        newText = resultLines.join('\n');
      } else {
        // Single line: simple wrapping
        if (isCode) {
          // For code: handle backtick runs
          const longest = longestRun(trailingText, '`');
          const fence = '`'.repeat(Math.max(longest + 1, 1));
          const needsSpace = trailingText.startsWith('`') || trailingText.endsWith('`');
          const spacer = needsSpace ? ' ' : '';
          newText =
            ' '.repeat(leadingSpaces) +
            fence +
            spacer +
            trailingText +
            spacer +
            fence +
            ' '.repeat(trailingSpaces);
        } else {
          newText =
            ' '.repeat(leadingSpaces) + marker + trailingText + marker + ' '.repeat(trailingSpaces);
        }
      }
    }

    // Calculate selection after transformation
    // For wrapping: selection covers the content part (between markers)
    // For unwrapping: selection covers the unwrapped text
    let selectionStart = from;
    let selectionEnd = from;

    if (isWrapped) {
      // Unwrapped: selection on the bare content
      selectionStart = from;
      selectionEnd = from + newText.length;
    } else {
      // Wrapped: selection on content (not on markers)
      selectionStart = from + marker.length;
      selectionEnd = from + newText.length - marker.length;
    }

    return {
      changes: [{ from, to, insert: newText }],
      range: EditorSelection.range(selectionStart, selectionEnd),
    };
  });

  if (!spec.changes || spec.changes.length === 0) return null;

  return { ...spec, userEvent: 'input.format' };
}

/** Toggle bold (**). */
export function toggleBold(state: EditorState): TransactionSpec | null {
  return toggleMarker(state, '**');
}

/** Toggle italic (*). */
export function toggleItalic(state: EditorState): TransactionSpec | null {
  return toggleMarker(state, '*');
}

/** Toggle strikethrough (~~). */
export function toggleStrikethrough(state: EditorState): TransactionSpec | null {
  return toggleMarker(state, '~~');
}

/** Toggle inline code (`). */
export function toggleInlineCode(state: EditorState): TransactionSpec | null {
  return toggleMarker(state, '`', true);
}

/** Insert a link: selection/word → [text](url), or [](url) if the text looks like a URL. */
export function insertLink(state: EditorState): TransactionSpec | null {
  const spec = state.changeByRange((range) => {
    const { from, to } = range;
    let text = state.doc.sliceString(from, to);
    let actualFrom = from;
    let actualTo = to;

    if (text === '') {
      // Empty selection: find the word under cursor
      const line = state.doc.lineAt(from);
      const lineText = line.text;
      const colInLine = from - line.from;

      // Find word boundaries
      let wordStart = colInLine;
      let wordEnd = colInLine;

      while (wordStart > 0 && isWordChar(lineText[wordStart - 1])) {
        wordStart--;
      }

      while (wordEnd < lineText.length && isWordChar(lineText[wordEnd])) {
        wordEnd++;
      }

      if (wordStart < wordEnd && wordStart <= colInLine && colInLine <= wordEnd) {
        text = lineText.slice(wordStart, wordEnd);
        actualFrom = line.from + wordStart;
        actualTo = line.from + wordEnd;
      }
    }

    const looksLikeUrl = /^(https?:\/\/|mailto:)/.test(text);

    let newText: string;
    let cursorPos: number;

    if (looksLikeUrl) {
      newText = '[](' + text + ')';
      cursorPos = actualFrom + 1; // cursor inside []
    } else if (text === '') {
      newText = '[](url)';
      cursorPos = actualFrom + 7; // select url
    } else {
      newText = '[' + text + '](url)';
      cursorPos = actualFrom + text.length + 3; // select url
    }

    return {
      changes: [{ from: actualFrom, to: actualTo, insert: newText }],
      range: EditorSelection.range(cursorPos, cursorPos + (looksLikeUrl ? text.length : 3)),
    };
  });

  if (!spec.changes || spec.changes.length === 0) return null;

  return { ...spec, userEvent: 'input.format' };
}

/** Toggle code block. */
export function toggleCodeBlock(state: EditorState): TransactionSpec | null {
  const spec = state.changeByRange((range) => {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    const tree = syntaxTree(state);

    // Check if we're inside a code block
    let isInCodeBlock = false;
    let codeBlockStart = -1;
    let codeBlockEnd = -1;

    tree.iterate({
      from: range.from,
      to: range.to,
      enter(node) {
        if (node.type.name === 'FencedCode') {
          isInCodeBlock = true;
          codeBlockStart = node.from;
          codeBlockEnd = node.to;
        }
      },
    });

    const changes: ChangeSpec[] = [];

    if (isInCodeBlock && codeBlockStart >= 0 && codeBlockEnd >= 0) {
      // Remove code block: delete the fence lines only
      const blockStartLine = state.doc.lineAt(codeBlockStart);
      const blockEndLine = state.doc.lineAt(codeBlockEnd - 1);

      // Collect fence line positions (in reverse order to delete correctly)
      const linesToDelete: Array<{ from: number; to: number }> = [];
      for (let i = blockEndLine.number; i >= blockStartLine.number; i--) {
        const line = state.doc.line(i);
        if (line.text.match(/^```+|^~~~+/)) {
          linesToDelete.push({
            from: line.from,
            to: i === blockEndLine.number ? line.to : line.to + 1,
          });
        }
      }

      // Add delete changes in reverse
      for (const del of linesToDelete) {
        changes.push({ from: del.from, to: del.to, insert: '' });
      }

      return {
        changes,
        range: EditorSelection.cursor(blockStartLine.from),
      };
    } else {
      // Add code block
      let fenceContent = '';
      for (let i = startLine.number; i <= endLine.number; i++) {
        const line = state.doc.line(i);
        fenceContent += line.text + '\n';
      }

      // Find longest backtick run in content
      const longest = longestRun(fenceContent, '`');
      const fence = '`'.repeat(Math.max(longest + 1, 3));

      const newText = fence + '\n' + fenceContent + fence + '\n';

      return {
        changes: [
          {
            from: startLine.from,
            to: endLine.to,
            insert: newText,
          },
        ],
        range: EditorSelection.cursor(startLine.from + fence.length + 1),
      };
    }
  });

  if (!spec.changes || spec.changes.length === 0) return null;

  return { ...spec, userEvent: 'input.format' };
}

/** Toggle blockquote. */
export function toggleQuote(state: EditorState): TransactionSpec | null {
  const spec = state.changeByRange((range) => {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    const changes: ChangeSpec[] = [];

    // Check if all non-blank lines already have > prefix
    let allQuoted = true;
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      if (line.text.trim() !== '' && !line.text.trimStart().startsWith('>')) {
        allQuoted = false;
        break;
      }
    }

    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      const lineText = line.text;

      let newText: string;
      if (lineText.trim() === '') {
        // Blank lines get `>` when quoting
        if (allQuoted && lineText.trimStart().startsWith('>')) {
          const trimmed = lineText.trimStart();
          const leading = lineText.slice(0, lineText.length - trimmed.length);
          newText = leading + (trimmed.startsWith('> ') ? trimmed.slice(2) : trimmed.slice(1));
        } else if (!allQuoted) {
          newText = '>';
        } else {
          continue;
        }
      } else {
        // Non-blank lines
        if (allQuoted && lineText.trimStart().startsWith('> ')) {
          // Remove one level
          const trimmed = lineText.trimStart();
          const leading = lineText.slice(0, lineText.length - trimmed.length);
          newText = leading + trimmed.slice(2);
        } else if (allQuoted && lineText.trimStart().startsWith('>')) {
          // Remove > without space
          const trimmed = lineText.trimStart();
          const leading = lineText.slice(0, lineText.length - trimmed.length);
          newText = leading + trimmed.slice(1);
        } else {
          // Add > prefix
          const trimmed = lineText.trimStart();
          const leading = lineText.slice(0, lineText.length - trimmed.length);
          newText = leading + '> ' + trimmed;
        }
      }

      if (newText !== lineText) {
        changes.push({ from: line.from, to: line.to, insert: newText });
      }
    }

    return { changes, range: EditorSelection.range(range.from, range.to) };
  });

  if (!spec.changes || spec.changes.length === 0) return null;

  return { ...spec, userEvent: 'input.format' };
}

/** Toggle list marker. */
export function toggleList(
  state: EditorState,
  kind: 'bullet' | 'ordered' | 'task',
): TransactionSpec | null {
  const spec = state.changeByRange((range) => {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    const changes: ChangeSpec[] = [];

    // Check if all non-blank lines already have this kind of marker
    let allHaveKind = true;
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      if (line.text.trim() === '') continue;

      const trimmed = line.text.trimStart();
      let hasMarker = false;

      // Check task BEFORE bullet (since task has bullet marker too)
      if (kind === 'task' && /^- \[[x ]\] /.test(trimmed)) {
        hasMarker = true;
      } else if (kind === 'bullet' && /^[-*+] /.test(trimmed)) {
        hasMarker = true;
      } else if (kind === 'ordered' && /^\d+[.)]\s/.test(trimmed)) {
        hasMarker = true;
      }

      if (!hasMarker) {
        allHaveKind = false;
        break;
      }
    }

    let lineCountForNumbering = 1;
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      if (line.text.trim() === '') continue;

      const lineText = line.text;
      const trimmed = lineText.trimStart();
      const leading = lineText.slice(0, lineText.length - trimmed.length);

      let newText: string;

      if (allHaveKind) {
        // Remove marker
        let content = trimmed;

        if (/^- \[[x ]\] /.test(trimmed)) {
          content = trimmed.slice(6);
        } else if (/^[-*+] /.test(trimmed)) {
          content = trimmed.slice(2);
        } else if (/^\d+[.)]\s/.test(trimmed)) {
          const m = /^\d+[.)]\s/.exec(trimmed);
          content = trimmed.slice(m![0].length);
        }

        newText = leading + content;
      } else {
        // Replace or add marker
        let content = trimmed;

        // Remove existing marker if any (check task first)
        if (/^- \[[x ]\] /.test(trimmed)) {
          content = trimmed.slice(6);
        } else if (/^[-*+] /.test(trimmed)) {
          content = trimmed.slice(2);
        } else if (/^\d+[.)]\s/.test(trimmed)) {
          const m = /^\d+[.)]\s/.exec(trimmed);
          content = trimmed.slice(m![0].length);
        }

        // Add new marker
        let newMarker = '';
        if (kind === 'bullet') {
          newMarker = '- ';
        } else if (kind === 'ordered') {
          newMarker = lineCountForNumbering + '. ';
        } else if (kind === 'task') {
          newMarker = '- [ ] ';
        }

        newText = leading + newMarker + content;
      }

      if (newText !== lineText) {
        changes.push({ from: line.from, to: line.to, insert: newText });
      }

      lineCountForNumbering++;
    }

    return { changes, range: EditorSelection.range(range.from, range.to) };
  });

  if (!spec.changes || spec.changes.length === 0) return null;

  return { ...spec, userEvent: 'input.format' };
}

/** Insert a horizontal rule. */
export function insertHorizontalRule(state: EditorState): TransactionSpec | null {
  const spec = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const lineStart = line.from;

    let before = '';
    let after = '';

    // Check if there's a blank line before (not at document start)
    if (line.number > 1) {
      const prevLine = state.doc.line(line.number - 1);
      if (prevLine.text.trim() !== '') {
        before = '\n';
      }
    }

    // Check if there's a blank line after (not at document end)
    if (line.number < state.doc.lines) {
      const nextLine = state.doc.line(line.number + 1);
      if (nextLine.text.trim() !== '') {
        after = '\n';
      }
    }

    const insertText = line.to === state.doc.length ? before + '---\n' : before + '---' + after;
    const insertPos = line.to + 1;

    return {
      changes: [{ from: insertPos, to: insertPos, insert: insertText }],
      range: EditorSelection.cursor(insertPos + before.length + 3),
    };
  });

  if (!spec.changes || spec.changes.length === 0) return null;

  return { ...spec, userEvent: 'input.format' };
}
