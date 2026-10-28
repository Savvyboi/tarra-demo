import DOMPurify from 'dompurify';

const ALLOWED_LINK_SCHEME_RE = /^(https?:\/\/|mailto:)/i;

export interface AttributeElementLike {
  tagName?: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/**
 * Enforces safe external link attributes on anchor tags (`SEC-02`):
 * - Only allows `http://`, `https://`, and `mailto:` schemes on `<a href="...">`.
 * - Drops relative, `javascript:`, `data:`, or empty `href` attributes so links
 *   inside event descriptions cannot navigate the app frame away or execute scripts.
 * - Sets `target="_blank"` and `rel="noopener noreferrer"` on every valid link.
 */
export function enforceSafeAnchorAttributes(node: AttributeElementLike): void {
  if (!node || typeof node.tagName !== 'string') return;
  if (node.tagName.toUpperCase() !== 'A') return;

  const rawHref = (node.getAttribute('href') || '').trim();
  if (rawHref && ALLOWED_LINK_SCHEME_RE.test(rawHref)) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  } else {
    node.removeAttribute('href');
    node.removeAttribute('target');
    node.removeAttribute('rel');
  }
}

let hookInstalled = false;

function ensurePurifyHook(): void {
  if (hookInstalled || !DOMPurify.isSupported) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    enforceSafeAnchorAttributes(node as unknown as AttributeElementLike);
  });
  hookInstalled = true;
}

export function sanitizeEventHtml(dirtyHtml: string): string {
  if (!dirtyHtml) return '';
  if (DOMPurify.isSupported) {
    ensurePurifyHook();
    return DOMPurify.sanitize(dirtyHtml, {
      USE_PROFILES: { html: true },
    });
  }
  return '';
}
