import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }));

import { isHostAllowed, isSafeExternalUrl } from './security';

describe('isHostAllowed', () => {
  const list = ['whatsapp.com'];
  it('matches exact and subdomain only', () => {
    expect(isHostAllowed('https://whatsapp.com/', list)).toBe(true);
    expect(isHostAllowed('https://web.whatsapp.com/x', list)).toBe(true);
    expect(isHostAllowed('https://evilwhatsapp.com/', list)).toBe(false);
    expect(isHostAllowed('https://whatsapp.com.evil.io/', list)).toBe(false);
    expect(isHostAllowed('https://evil.io/?u=whatsapp.com', list)).toBe(false);
    expect(isHostAllowed('http://web.whatsapp.com/', list)).toBe(false);
    expect(isHostAllowed('https://web.whatsapp.com/', [])).toBe(false);
  });
});

describe('isSafeExternalUrl', () => {
  it('allows plain https only', () => {
    expect(isSafeExternalUrl('https://example.com/a')).toBe(true);
    expect(isSafeExternalUrl('http://example.com')).toBe(false);
    expect(isSafeExternalUrl('https://user:pw@example.com')).toBe(false);
    expect(isSafeExternalUrl('file:///C:/x')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('canOpenExternal', () => {
  it('allows one call per second per key', async () => {
    const { canOpenExternal } = await import('./security');
    expect(canOpenExternal(901, 1000)).toBe(true);
    expect(canOpenExternal(901, 1500)).toBe(false);
    expect(canOpenExternal(902, 1500)).toBe(true);
    expect(canOpenExternal(901, 2100)).toBe(true);
  });
});
