import DOMPurify from 'dompurify';

const purify = DOMPurify(window);

// Block dangerous schemes on href/src; relative URLs and the asset protocol pass through.
const BAD_SCHEME = /^\s*(?:javascript|vbscript|file|data(?!:image\/)):/i;
const REMOTE_URL = /^\s*(?:https?:)?\/\//i;
const CSS_URL = /url\(/i;

// Sanitising is synchronous, so a module-level flag (set immediately before each
// sanitize() call and cleared in a finally) is how the hooks below learn the current
// call's options without changing DOMPurify's hook signature.
let blockRemoteImages = false;
// Remembers the original src/srcset a blocked <img>/<source> had, so
// afterSanitizeAttributes can mark the element once the attribute is gone.
const blockedRemoteSrc = new WeakMap<Element, string>();

purify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'href' || data.attrName === 'src') {
    if (BAD_SCHEME.test(data.attrValue)) data.keepAttr = false;
  }
  if (!blockRemoteImages) return;
  if (
    (node.tagName === 'IMG' || node.tagName === 'SOURCE') &&
    (data.attrName === 'src' || data.attrName === 'srcset') &&
    REMOTE_URL.test(data.attrValue)
  ) {
    data.keepAttr = false;
    blockedRemoteSrc.set(node, data.attrValue);
  }
  if (data.attrName === 'style' && CSS_URL.test(data.attrValue)) {
    data.keepAttr = false;
  }
});

purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    // External navigation is intercepted in the Preview component and routed to the OS.
    node.setAttribute('rel', 'noopener noreferrer');
  }
  const original = blockedRemoteSrc.get(node);
  if (original === undefined) return;
  blockedRemoteSrc.delete(node);
  node.setAttribute('class', `${node.getAttribute('class') ?? ''} remote-image-blocked`.trim());
  node.setAttribute('title', original);
});

export interface SanitizeOptions {
  blockRemoteImages?: boolean;
}

export function sanitizeHtml(html: string, opts: SanitizeOptions = {}): string {
  blockRemoteImages = opts.blockRemoteImages ?? false;
  try {
    return sanitizeHtmlInner(html);
  } finally {
    blockRemoteImages = false;
  }
}

function sanitizeHtmlInner(html: string): string {
  return purify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ADD_TAGS: [
      'kbd',
      'sub',
      'sup',
      'details',
      'summary',
      'mark',
      'abbr',
      'input',
      'annotation',
      'semantics',
    ],
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
      'encoding',
      'aria-hidden',
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
    // DOMPurify's default plus the Tauri `asset:` scheme. Note DOMPurify applies this to
    // every attribute value that looks like it could carry a URL, so it must keep
    // accepting plain words (SVG path data, MIME types, relative paths).
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|asset|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
