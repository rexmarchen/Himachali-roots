/**
 * Shared URI validation and sanitization helpers used by both backend Zod
 * schemas and React link/redirect components to block XSS (javascript:/data:)
 * and protocol-relative open-redirect (//evil.com) payloads.
 */

const CONTROL_OR_WHITESPACE_RE = /[\u0000-\u001f\u007f\s]/;

export function isSafeHttpUrl(raw: string, allowInsecureHttp = false): boolean {
  const trimmed = raw.trim();
  if (!trimmed || CONTROL_OR_WHITESPACE_RE.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return true;
    return allowInsecureHttp && parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isSafeInternalPath(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || CONTROL_OR_WHITESPACE_RE.test(trimmed)) return false;
  // Reject protocol-relative URLs like `//attacker.example` or backslash bypasses `/\evil.com`.
  return trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\');
}

export function isSafeSiteHref(raw: string, allowInsecureHttp = false): boolean {
  return isSafeInternalPath(raw) || isSafeHttpUrl(raw, allowInsecureHttp);
}

export function safeExternalUrl(raw: string | null | undefined, allowInsecureHttp = true): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isSafeHttpUrl(trimmed, allowInsecureHttp) || isSafeInternalPath(trimmed)) {
    return trimmed;
  }
  return null;
}
