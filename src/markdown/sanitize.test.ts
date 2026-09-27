import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitize';

describe('sanitizeHtml', () => {
  it('keeps KaTeX SVG paths (radicals) intact', () => {
    const out = sanitizeHtml(
      '<span class="hide-tail" style="height:1.08em;min-width:0.853em"><svg xmlns="http://www.w3.org/2000/svg" width="400em" height="1.08em" viewBox="0 0 400000 1080" preserveAspectRatio="xMinYMin slice"><path d="M95,702 c-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14"></path></svg></span>',
    );
    expect(out).toContain('<path d="M95,702');
    expect(out).toContain('viewBox="0 0 400000 1080"');
  });

  it('keeps MathML and inline styles used by KaTeX', () => {
    const out = sanitizeHtml(
      '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="vlist" style="height:1.2em;"></span></span></span>',
    );
    expect(out).toContain('<annotation encoding="application/x-tex">');
    expect(out).toContain('style="height:1.2em;"');
    expect(out).toContain('aria-hidden="true"');
  });

  it('strips scripts, event handlers and dangerous URLs', () => {
    const out = sanitizeHtml(
      '<a href="javascript:alert(1)" onclick="x()">a</a><img src="data:text/html,x"><svg onload="x()"><script>1</script></svg>',
    );
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onload');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('data:text/html');
  });

  it('allows relative and asset-protocol image sources', () => {
    const out = sanitizeHtml(
      '<img src="images/a.png"><img src="http://mdasset.localhost/C%3A/x.png"><img src="data:image/png;base64,AAAA">',
    );
    expect(out).toContain('src="images/a.png"');
    expect(out).toContain('src="http://mdasset.localhost/C%3A/x.png"');
    expect(out).toContain('src="data:image/png;base64,AAAA"');
  });

  it('allows a literal mdasset: scheme', () => {
    const out = sanitizeHtml('<img src="mdasset://localhost/C%3A/x.png">');
    expect(out).toContain('src="mdasset://localhost/C%3A/x.png"');
  });

  it('does not allow DOM clobbering via name/id attributes (SANITIZE_DOM)', () => {
    const out = sanitizeHtml('<img name="getElementById"><form id="test-form"></form>');
    expect(out).not.toContain('name="getElementById"');
    expect(out).not.toContain('<form');
  });

  it('keeps a colour swatch span, with its class, style and aria-hidden', () => {
    const out = sanitizeHtml(
      '<span class="color-swatch" style="--swatch: #aabbcc" aria-hidden="true"></span>',
    );
    expect(out).toContain('class="color-swatch"');
    expect(out).toContain('style="--swatch: #aabbcc"');
    expect(out).toContain('aria-hidden="true"');
  });

  it('keeps a colour swatch span nested inside a code pill', () => {
    const out = sanitizeHtml(
      '<code>#AA00BB<span class="color-swatch" style="--swatch: #AA00BB" aria-hidden="true"></span></code>',
    );
    expect(out).toContain(
      '<code>#AA00BB<span class="color-swatch" style="--swatch: #AA00BB" aria-hidden="true"></span></code>',
    );
  });

  describe('blockRemoteImages', () => {
    it('strips http(s) and protocol-relative image sources when on', () => {
      const out = sanitizeHtml(
        '<img src="https://evil.example/track.png" alt="a"><img src="//evil.example/b.png" alt="b">',
        { blockRemoteImages: true },
      );
      expect(out).not.toContain('src="https://evil.example/track.png"');
      expect(out).not.toContain('src="//evil.example/b.png"');
      expect(out).toContain('class="remote-image-blocked"');
      expect(out).toContain('title="https://evil.example/track.png"');
    });

    it('leaves local and data: image sources alone when on', () => {
      const out = sanitizeHtml('<img src="images/a.png"><img src="data:image/png;base64,AAAA">', {
        blockRemoteImages: true,
      });
      expect(out).toContain('src="images/a.png"');
      expect(out).toContain('src="data:image/png;base64,AAAA"');
      expect(out).not.toContain('remote-image-blocked');
    });

    it('strips a style attribute containing url() when on', () => {
      const out = sanitizeHtml('<div style="background:url(https://evil.example/x.png)">x</div>', {
        blockRemoteImages: true,
      });
      expect(out).not.toContain('url(');
    });

    it('leaves remote images alone when off (default)', () => {
      const out = sanitizeHtml('<img src="https://example.com/a.png">');
      expect(out).toContain('src="https://example.com/a.png"');
    });
  });
});
