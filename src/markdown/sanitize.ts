import DOMPurify from 'dompurify';

const purify = DOMPurify(window);

// Block dangerous schemes on href/src; relative URLs and the asset protocol pass through.
const BAD_SCHEME = /^\s*(?:javascript|vbscript|file|data(?!:image\/)):/i;

purify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName === 'href' || data.attrName === 'src') {
    if (BAD_SCHEME.test(data.attrValue)) data.keepAttr = false;
  }
});

purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    // External navigation is intercepted in the Preview component and routed to the OS.
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function sanitizeHtml(html: string): string {
  return purify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['kbd', 'sub', 'sup', 'details', 'summary', 'mark', 'abbr', 'input'],
    ADD_ATTR: [
      'data-line',
      'data-line-end',
      'data-lang',
      'id',
      'class',
      'style',
      'checked',
      'disabled',
      'type',
      'open',
      'align',
      'start',
    ],
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'textarea',
      'select',
      'button',
    ],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|asset|data|blob):|#|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
}
