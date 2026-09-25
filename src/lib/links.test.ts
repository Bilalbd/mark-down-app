import { describe, expect, it } from 'vitest';
import { classifyLink } from '@/lib/links';

const DOC = 'C:\\docs\\notes\\a.md';

describe('classifyLink', () => {
  it('treats a bare fragment as an in-page anchor', () => {
    expect(classifyLink('#section', DOC)).toEqual({ kind: 'anchor', id: 'section' });
  });

  it('falls back to the raw fragment on a malformed escape', () => {
    expect(classifyLink('#bad%zz', DOC)).toEqual({ kind: 'anchor', id: 'bad%zz' });
  });

  it('opens http(s) and mailto links externally', () => {
    expect(classifyLink('https://example.com', DOC)).toEqual({ kind: 'external' });
    expect(classifyLink('http://example.com/x', DOC)).toEqual({ kind: 'external' });
    expect(classifyLink('mailto:a@b.com', DOC)).toEqual({ kind: 'external' });
  });

  it('ignores javascript:, asset: and other internal schemes', () => {
    expect(classifyLink('javascript:alert(1)', DOC)).toEqual({ kind: 'ignore' });
    expect(classifyLink('asset://C:/x.png', DOC)).toEqual({ kind: 'ignore' });
    expect(classifyLink('http://asset.localhost/C:/x.png', DOC)).toEqual({ kind: 'ignore' });
    expect(classifyLink('http://mdasset.localhost/C:/x.png', DOC)).toEqual({ kind: 'ignore' });
    expect(classifyLink('//evil.example/x', DOC)).toEqual({ kind: 'ignore' });
  });

  it('resolves a relative markdown link against the document directory, ignoring its fragment', () => {
    expect(classifyLink('other.md#section', DOC)).toEqual({
      kind: 'markdown',
      path: 'C:\\docs\\notes\\other.md',
    });
  });

  it('decodes a percent-encoded relative path', () => {
    expect(classifyLink('sub%20dir/a.md', DOC)).toEqual({
      kind: 'markdown',
      path: 'C:\\docs\\notes\\sub dir\\a.md',
    });
  });

  it('resolves ../ segments and treats a non-markdown target as a file', () => {
    expect(classifyLink('../x.png', DOC)).toEqual({ kind: 'file', path: 'C:\\docs\\x.png' });
  });

  it('ignores relative links when there is no document path', () => {
    expect(classifyLink('other.md', null)).toEqual({ kind: 'ignore' });
  });
});
