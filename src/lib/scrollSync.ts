/**
 * Pure helpers for mapping a scroll position in one view to a fractional source
 * line and back. A "fractional line" like 12.4 means 40% of the way through
 * source line 12, which lets both panes move smoothly rather than snapping.
 */

export interface Block {
  /** First source line (0-based, inclusive). */
  start: number;
  /** Line after the last source line (exclusive). */
  end: number;
  /** Top offset in the scroll container, px. */
  top: number;
  /** Rendered height, px. */
  height: number;
}

/** Fractional source line for a scroll offset, given rendered blocks in document order. */
export function lineForOffset(blocks: Block[], offset: number): number {
  if (blocks.length === 0) return 0;
  let prev: Block | null = null;
  for (const b of blocks) {
    if (offset < b.top) {
      // In the gap between prev and b: interpolate across the gap.
      if (!prev) return b.start;
      const gapTop = prev.top + prev.height;
      const gap = b.top - gapTop;
      const f = gap > 0 ? clamp((offset - gapTop) / gap, 0, 1) : 1;
      return prev.end + (b.start - prev.end) * f;
    }
    if (offset < b.top + b.height) {
      const f = b.height > 0 ? (offset - b.top) / b.height : 0;
      return b.start + Math.max(b.end - b.start, 1) * f;
    }
    prev = b;
  }
  const last = blocks[blocks.length - 1];
  return last.end;
}

/** Scroll offset that puts fractional source `line` at the top, given rendered blocks. */
export function offsetForLine(blocks: Block[], line: number): number {
  if (blocks.length === 0) return 0;
  let prev: Block | null = null;
  for (const b of blocks) {
    if (line < b.start) {
      if (!prev) return b.top;
      const span = b.start - prev.end;
      const f = span > 0 ? clamp((line - prev.end) / span, 0, 1) : 1;
      const gapTop = prev.top + prev.height;
      return gapTop + (b.top - gapTop) * f;
    }
    if (line < b.end) {
      const f = (line - b.start) / Math.max(b.end - b.start, 1);
      return b.top + b.height * f;
    }
    prev = b;
  }
  const last = blocks[blocks.length - 1];
  return last.top + last.height;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Reads the top-level rendered blocks from a preview root element. */
export function collectPreviewBlocks(previewRoot: HTMLElement): Block[] {
  const blocks: Block[] = [];
  for (const el of Array.from(previewRoot.children) as HTMLElement[]) {
    const start = el.dataset.line;
    if (start === undefined) continue;
    const end = el.dataset.lineEnd;
    blocks.push({
      start: Number(start),
      end: end !== undefined ? Number(end) : Number(start) + 1,
      top: el.offsetTop,
      height: el.offsetHeight,
    });
  }
  return blocks;
}
