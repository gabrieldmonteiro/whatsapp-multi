import type { AccountColor } from '../state/types';

/** Palette token -> badge colors (bg/fg pairs chosen for >= 4.5:1 contrast). */
export const COLOR_STYLES: Record<AccountColor, { bg: string; fg: string }> = {
  green: { bg: '#15803d', fg: '#ffffff' },
  teal: { bg: '#0f766e', fg: '#ffffff' },
  blue: { bg: '#1d4ed8', fg: '#ffffff' },
  violet: { bg: '#6d28d9', fg: '#ffffff' },
  pink: { bg: '#be185d', fg: '#ffffff' },
  red: { bg: '#b91c1c', fg: '#ffffff' },
  orange: { bg: '#c2410c', fg: '#ffffff' },
  yellow: { bg: '#facc15', fg: '#1c1917' },
  gray: { bg: '#52525b', fg: '#ffffff' },
};

export const COLOR_NAMES = Object.keys(COLOR_STYLES) as AccountColor[];

export function errorCode(e: unknown): string {
  const m = e instanceof Error ? e.message : '';
  return /LIMIT_REACHED|NOT_FOUND|INVALID/.exec(m)?.[0] ?? 'UNKNOWN';
}
