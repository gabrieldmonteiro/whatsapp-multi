import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }));

import { checkPermission, decidePermission } from './account-session';
import { WHATSAPP_HOSTS, isHostAllowed } from './security';

const on = { notifications: true };
const off = { notifications: false };
const wa = 'https://web.whatsapp.com/';

describe('WhatsApp allowlist', () => {
  it('matches parsed hostname only', () => {
    expect(isHostAllowed(wa, WHATSAPP_HOSTS)).toBe(true);
    expect(isHostAllowed('https://media.cdn.whatsapp.net/x', WHATSAPP_HOSTS)).toBe(true);
    expect(isHostAllowed('https://whatsapp.com.evil.com/', WHATSAPP_HOSTS)).toBe(false);
    expect(isHostAllowed('https://evilwhatsapp.com/', WHATSAPP_HOSTS)).toBe(false);
    expect(isHostAllowed('https://evil.com/?u=web.whatsapp.com', WHATSAPP_HOSTS)).toBe(false);
    expect(isHostAllowed('https://web.whatsapp.com@evil.com/', WHATSAPP_HOSTS)).toBe(false);
    expect(isHostAllowed('http://web.whatsapp.com/', WHATSAPP_HOSTS)).toBe(false);
  });
});

describe('permission policy', () => {
  it('notifications follow the flag', () => {
    expect(decidePermission('notifications', wa, on)).toBe('grant');
    expect(decidePermission('notifications', wa, off)).toBe('deny');
  });
  it('denies foreign origins and unknown accounts', () => {
    expect(decidePermission('notifications', 'https://evil.com/', on)).toBe('deny');
    expect(decidePermission('notifications', wa, undefined)).toBe('deny');
  });
  it('media asks, clipboard granted, rest denied', () => {
    expect(decidePermission('media', wa, on)).toBe('ask-media');
    expect(decidePermission('clipboard-sanitized-write', wa, off)).toBe('grant');
    expect(decidePermission('persistent-storage', wa, off)).toBe('grant');
    expect(decidePermission('persistent-storage', 'https://static.whatsapp.net/', off)).toBe('deny');
    expect(decidePermission('geolocation', wa, on)).toBe('deny');
  });
  it('check handler never pre-grants media', () => {
    expect(checkPermission('media', wa, on)).toBe(false);
    expect(checkPermission('notifications', wa, on)).toBe(true);
    expect(checkPermission('clipboard-sanitized-write', wa, on)).toBe(true);
  });
});

describe('grant origin', () => {
  it('only exact https://web.whatsapp.com', () => {
    expect(decidePermission('notifications', 'https://web.whatsapp.com/x', on)).toBe('grant');
    expect(decidePermission('notifications', 'https://www.whatsapp.com/', on)).toBe('deny');
    expect(decidePermission('notifications', 'https://web.whatsapp.net/', on)).toBe('deny');
    expect(decidePermission('media', 'https://a.web.whatsapp.com/', on)).toBe('deny');
  });
});
