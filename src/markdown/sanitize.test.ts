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
      '<img src="images/a.png"><img src="http://asset.localhost/C%3A/x.png"><img src="data:image/png;base64,AAAA">',
    );
    expect(out).toContain('src="images/a.png"');
    expect(out).toContain('src="http://asset.localhost/C%3A/x.png"');
    expect(out).toContain('src="data:image/png;base64,AAAA"');
  });
});
