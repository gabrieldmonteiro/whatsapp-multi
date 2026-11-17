import type { Bounds } from '../shared/account';

/** Parses the leading "(N)" in a WhatsApp Web page title. No count means 0. */
export function parseUnread(title: string): number {
  const m = /^\s*\((\d{1,6})\)/.exec(title);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : 0;
}

/** Clamps a renderer-reported rect to the window content size. */
export function clampBounds(b: Bounds, content: { width: number; height: number }): Bounds {
  const x = Math.min(Math.max(0, b.x), Math.max(0, content.width));
  const y = Math.min(Math.max(0, b.y), Math.max(0, content.height));
  return {
    x,
    y,
    width: Math.max(0, Math.min(b.width, content.width - x)),
    height: Math.max(0, Math.min(b.height, content.height - y)),
  };
}

export type Shortcut = { kind: 'index'; index: number } | { kind: 'cycle'; delta: 1 | -1 };

export interface KeyInput {
  type: string;
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

/** Ctrl/Cmd+1..9 selects an account by order; Ctrl+Tab / Ctrl+Shift+Tab cycles. */
export function shortcutFor(input: KeyInput): Shortcut | null {
  if (input.type !== 'keyDown' || input.alt || !(input.control || input.meta)) return null;
  if (/^[1-9]$/.test(input.key) && !input.shift)
    return { kind: 'index', index: Number(input.key) - 1 };
  if (input.key === 'Tab') return { kind: 'cycle', delta: input.shift ? -1 : 1 };
  return null;
}
