import { describe, expect, it, vi } from 'vitest';
import { needsExternalSync } from './SourceEditor';

describe('needsExternalSync', () => {
  it('returns false without calling readDoc when content matches lastEmitted', () => {
    const readDoc = vi.fn(() => 'different');
    const result = needsExternalSync('hello', 'hello', readDoc);
    expect(result).toBe(false);
    expect(readDoc).not.toHaveBeenCalled();
  });

  it('calls readDoc and returns false when doc matches content but lastEmitted differs', () => {
    const readDoc = vi.fn(() => 'hello');
    const result = needsExternalSync('hello', 'old', readDoc);
    expect(result).toBe(false);
    expect(readDoc).toHaveBeenCalledOnce();
  });

  it('calls readDoc and returns true when doc differs from content', () => {
    const readDoc = vi.fn(() => 'old');
    const result = needsExternalSync('hello', null, readDoc);
    expect(result).toBe(true);
    expect(readDoc).toHaveBeenCalledOnce();
  });

  it('detects real external changes', () => {
    const readDoc = vi.fn(() => 'external change');
    const result = needsExternalSync('current', null, readDoc);
    expect(result).toBe(true);
  });
});
