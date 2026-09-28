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

  // Add new heading marker if level > 0
  if (level > 0) {
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
  const changes: ChangeSpec[] = [];

  state.changeByRange((range) => {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);

    for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo++) {
      const line = state.doc.line(lineNo);
      const text = line.text;

      // Check if all touched lines already have this level
      const hasLevel = hasHeadingLevel(text, level);

      const newText = setLineHeading(text, hasLevel ? 0 : level);
      if (newText !== text) {
        changes.push({ from: line.from, to: line.to, insert: newText });
      }
    }

    return { range: EditorSelection.range(range.from, range.to) };
  });

  if (changes.length === 0) return null;

  return {
    changes,
    userEvent: 'input.format',
  };
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

/** Toggle marker wrapping (e.g., ** for bold). Handles selection on word, multi-line, etc. */
function toggleMarker(state: EditorState, marker: string, isCode = false): TransactionSpec | null {
  const changes: ChangeSpec[] = [];

  state.changeByRange((range) => {
    const { from, to } = range;
    const text = state.doc.sliceString(from, to);

    if (text === '') {
      // Empty selection: find the word under cursor or insert pair
      const line = state.doc.lineAt(from);
      const lineText = line.text;
      const colInLine = from - line.from;

      // Find word at cursor
      const wordStart = Math.max(
        0,
        lineText.lastIndexOf(' ', colInLine - 1) + 1,
        lineText.lastIndexOf('\t', colInLine - 1) + 1,
      );
      const wordEnd = lineText.indexOf(' ', colInLine);
      const wordEndTab = lineText.indexOf('\t', colInLine);
      const actualEnd = Math.min(
        lineText.length,
        wordEnd === -1 ? lineText.length : wordEnd,
        wordEndTab === -1 ? lineText.length : wordEndTab,
      );

      if (wordStart !== actualEnd && wordStart < colInLine && colInLine <= actualEnd) {
        // Word found under cursor
        const word = lineText.slice(wordStart, actualEnd);
        const start = line.from + wordStart;
        const end = line.from + actualEnd;
        const wrapped = marker + word + marker;
        changes.push({ from: start, to: end, insert: wrapped });
        return {
          range: EditorSelection.range(start, start + wrapped.length),
        };
      } else {
        // No word: insert pair with cursor between
        const pair = marker + marker;
        changes.push({ from, to, insert: pair });
        return {
          range: EditorSelection.cursor(from + marker.length),
        };
      }
    }

    // Non-empty selection: check for wrapping or multiple lines
    const lines = text.split('\n');
    const hasMultipleLines = lines.length > 1;

    if (hasMultipleLines) {
      // Multi-line: apply to each non-empty line separately
      let offset = 0;
      let newText = '';
      for (const line of lines) {
        if (line.trim() === '') {
          newText += line + '\n';
        } else {
          const leading = line.length - line.trimStart().length;
          const trailing = line.length - line.trimEnd().length;
          const spaces = line.slice(0, leading);
          const content = line.slice(leading, line.length - trailing);
          const trailingSpaces = line.slice(line.length - trailing);

          const isWrapped =
            content.startsWith(marker) &&
            content.endsWith(marker) &&
            content.length >= marker.length * 2;

          if (isWrapped) {
            newText += spaces + content.slice(marker.length, -marker.length) + trailingSpaces;
          } else {
            newText += spaces + marker + content + marker + trailingSpaces;
          }
          if (offset < text.length - 1) newText += '\n';
        }
        offset += line.length + 1;
      }
      const result = newText.endsWith('\n') ? newText.slice(0, -1) : newText;
      changes.push({ from, to, insert: result });
      return {
        range: EditorSelection.range(from, from + result.length),
      };
    }

    // Single line: handle wrapping with space trimming
    const trimmedText = text.trimStart();
    const leadingSpaces = text.length - trimmedText.length;
    const trailingText = trimmedText.trimEnd();
    const trailingSpaces = trimmedText.length - trailingText.length;

    // Check if wrapped with the marker at boundaries
    // *text* is wrapped with *, but **text** is not (when looking for *)
    // The key: after the marker, the next character must not be the same character as the first char of the marker
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
      // Wrap
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

    changes.push({ from, to, insert: newText });
    return {
      range: EditorSelection.range(from, from + newText.length),
    };
  });

  if (changes.length === 0) return null;

  return {
    changes,
    userEvent: 'input.format',
  };
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
  const changes: ChangeSpec[] = [];

  state.changeByRange((range) => {
    const { from, to } = range;
    let text = state.doc.sliceString(from, to);

    if (text === '') {
      // Empty selection: find the word under cursor
      const line = state.doc.lineAt(from);
      const lineText = line.text;
      const colInLine = from - line.from;

      const wordStart = Math.max(
        0,
        lineText.lastIndexOf(' ', colInLine - 1) + 1,
        lineText.lastIndexOf('\t', colInLine - 1) + 1,
      );
      const wordEnd = Math.min(
        lineText.length,
        lineText.indexOf(' ', colInLine) === -1
          ? lineText.length
          : lineText.indexOf(' ', colInLine),
      );

      if (wordStart < wordEnd && wordStart < colInLine && colInLine <= wordEnd) {
        text = lineText.slice(wordStart, wordEnd);
      }
    }

    const looksLikeUrl = /^(https?:\/\/|mailto:)/.test(text);

    let newText: string;
    let cursorPos: number;

    if (looksLikeUrl) {
      newText = '[](' + text + ')';
      cursorPos = from + 1; // cursor inside []
    } else if (text === '') {
      newText = '[](url)';
      cursorPos = from + 1; // cursor inside []
    } else {
      newText = '[' + text + '](url)';
      cursorPos = from + text.length + 3; // cursor inside ()
    }

    changes.push({ from, to, insert: newText });

    return {
      range: EditorSelection.cursor(cursorPos),
    };
  });

  return {
    changes,
    userEvent: 'input.format',
  };
}

/** Toggle code block. */
export function toggleCodeBlock(state: EditorState): TransactionSpec | null {
  const changes: ChangeSpec[] = [];
  const tree = syntaxTree(state);

  state.changeByRange((range) => {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);

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

    if (isInCodeBlock && codeBlockStart >= 0 && codeBlockEnd >= 0) {
      // Remove code block: delete the fence lines
      const blockStartLine = state.doc.lineAt(codeBlockStart);
      const blockEndLine = state.doc.lineAt(codeBlockEnd - 1);

      const lines = [];
      for (let i = blockStartLine.number; i <= blockEndLine.number; i++) {
        const line = state.doc.line(i);
        const text = line.text;
        if (text.match(/^```+/)) {
          // This is a fence line, skip it
          continue;
        }
        lines.push(line);
      }

      // Remove all fence lines
      const delChanges: ChangeSpec[] = [];
      for (let i = blockEndLine.number; i >= blockStartLine.number; i--) {
        const line = state.doc.line(i);
        if (line.text.match(/^```+/)) {
          delChanges.push({
            from: line.from,
            to: i === blockEndLine.number ? line.to : line.to + 1,
          });
        }
      }

      changes.push(...delChanges);

      return {
        range: EditorSelection.cursor(blockStartLine.from),
      };
    } else {
      // Add code block
      const firstLine = startLine;
      const lastLine = endLine;

      const contentStart = firstLine.from;
      const contentEnd = lastLine.to;
      let fenceContent = '';

      for (let i = firstLine.number; i <= lastLine.number; i++) {
        const line = state.doc.line(i);
        fenceContent += line.text + '\n';
      }

      // Find longest backtick run in content
      const longest = longestRun(fenceContent, '`');
      const fence = '`'.repeat(Math.max(longest + 1, 3));

      const newText = fence + '\n' + fenceContent + fence + '\n';
      changes.push({
        from: contentStart,
        to: contentEnd,
        insert: newText,
      });

      // Cursor after opening fence
      return {
        range: EditorSelection.cursor(contentStart + fence.length + 1),
      };
    }
  });

  if (changes.length === 0) return null;

  return {
    changes,
    userEvent: 'input.format',
  };
}

/** Toggle blockquote. */
export function toggleQuote(state: EditorState): TransactionSpec | null {
  const changes: ChangeSpec[] = [];

  state.changeByRange((range) => {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);

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
      if (line.text.trim() === '') continue;

      let newText: string;
      const lineText = line.text;
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

      if (newText !== lineText) {
        changes.push({ from: line.from, to: line.to, insert: newText });
      }
    }

    return { range: EditorSelection.range(range.from, range.to) };
  });

  if (changes.length === 0) return null;

  return {
    changes,
    userEvent: 'input.format',
  };
}

/** Toggle list marker. */
export function toggleList(
  state: EditorState,
  kind: 'bullet' | 'ordered' | 'task',
): TransactionSpec | null {
  const changes: ChangeSpec[] = [];

  state.changeByRange((range) => {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);

    // Check if all non-blank lines already have this kind of marker
    let allHaveKind = true;
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      if (line.text.trim() === '') continue;

      const trimmed = line.text.trimStart();
      let hasMarker = false;

      if (kind === 'bullet' && /^[-*+] /.test(trimmed)) {
        hasMarker = true;
      } else if (kind === 'ordered' && /^\d+[.)]\s/.test(trimmed)) {
        hasMarker = true;
      } else if (kind === 'task' && /^- \[[x ]\] /.test(trimmed)) {
        hasMarker = true;
      }

      if (!hasMarker) {
        allHaveKind = false;
        break;
      }
    }

    let lineNum = startLine.number;
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      if (line.text.trim() === '') continue;

      const lineText = line.text;
      const trimmed = lineText.trimStart();
      const leading = lineText.slice(0, lineText.length - trimmed.length);

      let newText: string;

      if (allHaveKind) {
        // Remove marker
        let marker = '';
        let content = trimmed;

        if (/^[-*+] /.test(trimmed)) {
          marker = trimmed[0];
          content = trimmed.slice(2);
        } else if (/^\d+[.)]\s/.test(trimmed)) {
          const m = /^\d+[.)]\s/.exec(trimmed);
          marker = m![0];
          content = trimmed.slice(marker.length);
        } else if (/^- \[[x ]\] /.test(trimmed)) {
          marker = trimmed.slice(0, 6);
          content = trimmed.slice(6);
        }

        newText = leading + content;
      } else {
        // Replace or add marker
        let content = trimmed;
        let newMarker = '';

        // Remove existing marker if any
        const bulletMatch = /^[-*+] /.exec(trimmed);
        const orderedMatch = /^\d+[.)]\s/.exec(trimmed);
        const taskMatch = /^- \[[x ]\] /.exec(trimmed);

        if (bulletMatch) {
          content = trimmed.slice(bulletMatch[0].length);
        } else if (orderedMatch) {
          content = trimmed.slice(orderedMatch[0].length);
        } else if (taskMatch) {
          content = trimmed.slice(taskMatch[0].length);
        }

        // Add new marker
        if (kind === 'bullet') {
          newMarker = '- ';
        } else if (kind === 'ordered') {
          newMarker = lineNum + '. ';
        } else if (kind === 'task') {
          newMarker = '- [ ] ';
        }

        newText = leading + newMarker + content;
      }

      if (newText !== lineText) {
        changes.push({ from: line.from, to: line.to, insert: newText });
      }

      lineNum++;
    }

    return { range: EditorSelection.range(range.from, range.to) };
  });

  if (changes.length === 0) return null;

  return {
    changes,
    userEvent: 'input.format',
  };
}

/** Insert a horizontal rule. */
export function insertHorizontalRule(state: EditorState): TransactionSpec | null {
  const changes: ChangeSpec[] = [];

  state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const insertAt = line.from;
    let before = '';
    let after = '';

    // Check if there's a blank line before
    if (line.number > 1) {
      const prevLine = state.doc.line(line.number - 1);
      if (prevLine.text.trim() !== '') {
        before = '\n';
      }
    }

    // Check if there's a blank line after
    if (line.number < state.doc.lines) {
      const nextLine = state.doc.line(line.number + 1);
      if (nextLine.text.trim() !== '') {
        after = '\n';
      }
    }

    const rule = before + '---' + after;
    changes.push({ from: insertAt, to: insertAt, insert: rule });

    // Cursor after the rule
    const cursorPos = insertAt + before.length + 3;

    return {
      range: EditorSelection.cursor(cursorPos),
    };
  });

  if (changes.length === 0) return null;

  return {
    changes,
    userEvent: 'input.format',
  };
}
