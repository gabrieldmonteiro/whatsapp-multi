import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { userAgentFallback: '' } }));

import { stripAppTokens } from './user-agent';
import { clampBounds, parseUnread, shortcutFor } from './view-utils';
import type { KeyInput } from './view-utils';

describe('stripAppTokens', () => {
  it('removes Electron and app tokens only', () => {
    const fb =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) whatsapp-multi/0.1.0 Chrome/150.0.0.0 Electron/45.3.3 Safari/537.36';
    expect(stripAppTokens(fb)).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    );
  });
  it('leaves a clean UA unchanged', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
    expect(stripAppTokens(ua)).toBe(ua);
  });
});

describe('parseUnread', () => {
  it('parses leading count', () => {
    expect(parseUnread('(12) WhatsApp')).toBe(12);
    expect(parseUnread('WhatsApp')).toBe(0);
    expect(parseUnread('WhatsApp (3)')).toBe(0);
  });
});

describe('clampBounds', () => {
  it('clamps to content size', () => {
    expect(
      clampBounds({ x: 10, y: 0, width: 5000, height: 5000 }, { width: 800, height: 600 }),
    ).toEqual({
      x: 10,
      y: 0,
      width: 790,
      height: 600,
    });
    expect(
      clampBounds({ x: 900, y: 0, width: 10, height: 10 }, { width: 800, height: 600 }).width,
    ).toBe(0);
  });
});

describe('shortcutFor', () => {
  const k = (key: string, o: Partial<KeyInput> = {}): KeyInput => ({
    type: 'keyDown',
    key,
    control: true,
    meta: false,
    shift: false,
    alt: false,
    ...o,
  });
  it('maps Ctrl+digit and Ctrl+Tab', () => {
    expect(shortcutFor(k('3'))).toEqual({ kind: 'index', index: 2 });
    expect(shortcutFor(k('Tab'))).toEqual({ kind: 'cycle', delta: 1 });
    expect(shortcutFor(k('Tab', { shift: true }))).toEqual({ kind: 'cycle', delta: -1 });
  });
  it('ignores other input', () => {
    expect(shortcutFor(k('0'))).toBeNull();
    expect(shortcutFor(k('3', { control: false }))).toBeNull();
    expect(shortcutFor(k('3', { type: 'keyUp' }))).toBeNull();
    expect(shortcutFor(k('3', { alt: true }))).toBeNull();
  });
});
