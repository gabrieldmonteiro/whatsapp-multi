import { shell } from 'electron';
import type { Session, WebContents } from 'electron';

/** Hosts a future account view may navigate to. Exact or dot-suffix match on hostname. */
export type HostAllowlist = readonly string[];

/** Hosts an account view (web.whatsapp.com) may navigate to. */
export const WHATSAPP_HOSTS: HostAllowlist = ['whatsapp.com', 'whatsapp.net'];

export function isHostAllowed(url: string, allowlist: HostAllowlist): boolean {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowlist.some((entry) => {
    const e = entry.toLowerCase();
    return host === e || host.endsWith('.' + e);
  });
}

/** https only, no embedded credentials. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.username === '' && u.password === '';
  } catch {
    return false;
  }
}

/** Deny-all permissions. Reuse for future persist:account-<id> sessions. */
export function hardenSession(ses: Session): void {
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
}

export interface HardenOptions {
  /** Future hook: hosts a view may navigate to. Empty by default (all navigation blocked). */
  navigationAllowlist?: HostAllowlist;
}

const lastExternalOpen = new Map<number, number>();

/** At most one openExternal per second per webContents. */
export function canOpenExternal(key: number, now = Date.now()): boolean {
  const last = lastExternalOpen.get(key);
  if (last !== undefined && now - last < 1000) return false;
  lastExternalOpen.set(key, now);
  return true;
}

export function hardenWebContents(wc: WebContents, opts: HardenOptions = {}): void {
  const allow = opts.navigationAllowlist ?? [];
  wc.once('destroyed', () => lastExternalOpen.delete(wc.id));
  wc.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url) && canOpenExternal(wc.id)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event) => {
    if (!isHostAllowed(event.url, allow)) event.preventDefault();
  });
  wc.on('will-redirect', (event) => {
    if (!isHostAllowed(event.url, allow)) event.preventDefault();
  });
  wc.on('will-attach-webview', (event) => event.preventDefault());
}
