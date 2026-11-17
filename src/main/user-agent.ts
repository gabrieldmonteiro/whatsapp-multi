import { app } from 'electron';

const KEEP = new Set(['Mozilla', 'AppleWebKit', 'Chrome', 'Safari']);

/**
 * Removes the Electron and app-name product tokens from an Electron UA, leaving the bundled
 * Chromium UA. Pure; the version comes from the input, never hard-coded.
 */
export function stripAppTokens(fallback: string): string {
  return fallback
    .split(/\s+/)
    .filter((tok) => {
      const m = /^([^/\s()]+)\/\S+$/.exec(tok);
      return m === null || KEEP.has(m[1] ?? '');
    })
    .join(' ');
}

export function chromiumUserAgent(): string {
  return stripAppTokens(app.userAgentFallback);
}
