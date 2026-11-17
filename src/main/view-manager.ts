import { WebContentsView } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import { partitionFor } from '../shared/account';
import type { Account, Bounds, ViewInfo, ViewState } from '../shared/account';
import { IpcError } from './account-store';
import { WHATSAPP_HOSTS, hardenWebContents, isHostAllowed } from './security';
import { clampBounds, parseUnread, shortcutFor } from './view-utils';

export const WHATSAPP_URL = 'https://web.whatsapp.com/';
export const IDLE_DESTROY_MS = 5 * 60 * 1000;
export const KEEP_ALIVE_STAGGER_MS = 2000;
const ERR_ABORTED = -3;

interface Entry {
  view: WebContentsView;
  state: ViewState;
  unread: number | null;
  titleUnread: number;
  errorCode?: number;
  attached: boolean;
  idleTimer: NodeJS.Timeout | null;
}

export interface ViewManagerDeps {
  getWindow: () => BrowserWindow | null;
  listAccounts: () => Account[];
  getAccount: (id: string) => Account | undefined;
  userAgent: string;
  /** Idempotent: hardens the account partition's session before its first view exists. */
  prepareSession: (id: string) => void;
  onState: (info: ViewInfo) => void;
  onActive: (id: string | null) => void;
  onTotalUnread: (total: number) => void;
}

export class ViewManager {
  private entries = new Map<string, Entry>();
  private activeId: string | null = null;
  private bounds: Bounds | null = null;
  private keepAliveTimers: NodeJS.Timeout[] = [];

  constructor(private readonly deps: ViewManagerDeps) {}

  getActive(): string | null {
    return this.activeId;
  }

  /** Activates the account at the given order index (0-based); ignored if out of range. */
  activateByIndex(index: number): void {
    const a = this.deps.listAccounts()[index];
    if (a) this.activate(a.id);
  }

  /** Activates the next/previous account by order, wrapping. */
  cycle(delta: 1 | -1): void {
    const list = this.deps.listAccounts();
    if (list.length === 0) return;
    const cur = list.findIndex((a) => a.id === this.activeId);
    const next =
      cur < 0 ? (delta === 1 ? 0 : list.length - 1) : (cur + delta + list.length) % list.length;
    const target = list[next];
    if (target) this.activate(target.id);
  }

  /** Hooks account-switch shortcuts on a webContents (keyboard events only, no page access). */
  attachShortcuts(wc: WebContents): void {
    wc.on('before-input-event', (event, input) => {
      const sc = shortcutFor(input);
      if (!sc) return;
      event.preventDefault();
      if (sc.kind === 'index') this.activateByIndex(sc.index);
      else this.cycle(sc.delta);
    });
  }

  getStates(): ViewInfo[] {
    return this.deps.listAccounts().map((a) => this.info(a.id));
  }

  activate(id: string | null): void {
    if (id !== null && !this.deps.getAccount(id)) throw new IpcError('NOT_FOUND');
    const prev = this.activeId;
    if (prev !== null && prev !== id) this.deactivate(prev);
    this.activeId = id;
    if (id !== null) {
      const entry = this.ensure(id);
      this.clearIdle(entry);
      this.applyBounds();
    }
    this.deps.onActive(id);
  }

  setBounds(b: Bounds | null): void {
    this.bounds = b;
    this.applyBounds();
  }

  reload(id: string): void {
    if (!this.deps.getAccount(id)) throw new IpcError('NOT_FOUND');
    this.destroy(id, true);
    const entry = this.ensure(id);
    if (this.activeId === id) this.applyBounds();
    else this.armIdle(id, entry);
  }

  /** Keep-alive accounts are created hidden in the background, staggered. */
  startKeepAlive(): void {
    let delay = 0;
    for (const a of this.deps.listAccounts()) {
      if (!a.keepAlive) continue;
      const t = setTimeout(() => {
        if (this.deps.getAccount(a.id)?.keepAlive && !this.entries.has(a.id)) this.ensure(a.id);
      }, delay);
      t.unref();
      this.keepAliveTimers.push(t);
      delay += KEEP_ALIVE_STAGGER_MS;
    }
  }

  /** Call after an account's keepAlive flag changed. */
  onAccountUpdated(account: Account): void {
    const entry = this.entries.get(account.id);
    if (!entry || this.activeId === account.id) return;
    if (account.keepAlive) this.clearIdle(entry);
    else this.armIdle(account.id, entry);
  }

  /** Destroys the view (account removal or idle). Silent suppresses the idle state event. */
  destroy(id: string, silent = false): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.clearIdle(entry);
    this.entries.delete(id);
    if (this.activeId === id) {
      this.activeId = null;
      if (!silent) this.deps.onActive(null);
    }
    const win = this.deps.getWindow();
    if (entry.attached && win && !win.isDestroyed()) {
      try {
        win.contentView.removeChildView(entry.view);
      } catch {
        // already detached
      }
    }
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
    if (!silent) this.deps.onState({ id, state: 'idle', unread: null });
    this.publishTotal();
  }

  closeAll(): void {
    this.keepAliveTimers.forEach(clearTimeout);
    this.keepAliveTimers = [];
    for (const id of [...this.entries.keys()]) this.destroy(id, true);
  }

  private info(id: string): ViewInfo {
    const e = this.entries.get(id);
    if (!e) return { id, state: 'idle', unread: null };
    const info: ViewInfo = { id, state: e.state, unread: e.unread };
    if (e.errorCode !== undefined) info.errorCode = e.errorCode;
    return info;
  }

  private deactivate(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.view.setVisible(false);
    this.armIdle(id, entry);
  }

  private armIdle(id: string, entry: Entry): void {
    this.clearIdle(entry);
    const acc = this.deps.getAccount(id);
    if (!acc || acc.keepAlive) return;
    entry.idleTimer = setTimeout(() => {
      if (this.activeId !== id) this.destroy(id);
    }, IDLE_DESTROY_MS);
    entry.idleTimer.unref();
  }

  private clearIdle(entry: Entry): void {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }

  private applyBounds(): void {
    const win = this.deps.getWindow();
    if (this.activeId === null || !win || win.isDestroyed()) return;
    const entry = this.entries.get(this.activeId);
    if (!entry) return;
    if (this.bounds === null) {
      entry.view.setVisible(false);
      return;
    }
    this.attach(entry);
    const [width, height] = win.getContentSize();
    entry.view.setBounds(clampBounds(this.bounds, { width: width ?? 0, height: height ?? 0 }));
    entry.view.setVisible(true);
  }

  private attach(entry: Entry): void {
    const win = this.deps.getWindow();
    if (entry.attached || !win || win.isDestroyed()) return;
    win.contentView.addChildView(entry.view);
    entry.attached = true;
  }

  private ensure(id: string): Entry {
    const existing = this.entries.get(id);
    if (existing) return existing;

    this.deps.prepareSession(id);
    const view = new WebContentsView({
      webPreferences: {
        partition: partitionFor(id),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    });
    view.setVisible(false);
    const entry: Entry = {
      view,
      state: 'loading',
      unread: null,
      titleUnread: 0,
      attached: false,
      idleTimer: null,
    };
    this.entries.set(id, entry);
    this.attach(entry);

    const wc = view.webContents;
    hardenWebContents(wc, { navigationAllowlist: WHATSAPP_HOSTS });
    this.attachShortcuts(wc);

    // Only full main-frame navigations count as loading. did-start-loading also fires for
    // subframes and in-page loads (e.g. after QR login), which would hide the view forever
    // because did-finish-load is main-frame only.
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.setState(id, entry, 'loading');
    });
    wc.on('did-finish-load', () => {
      if (isHostAllowed(wc.getURL(), WHATSAPP_HOSTS)) this.setState(id, entry, 'ready');
    });
    wc.on('did-fail-load', (_e, errorCode, _desc, _url, isMainFrame) => {
      if (!isMainFrame || errorCode === ERR_ABORTED) return;
      this.setState(id, entry, 'error', errorCode);
    });
    wc.on('render-process-gone', () => this.setState(id, entry, 'crashed'));
    wc.on('page-title-updated', (_e, title) => {
      entry.titleUnread = parseUnread(title);
      if (entry.state === 'ready' && entry.unread !== entry.titleUnread) {
        entry.unread = entry.titleUnread;
        this.deps.onState(this.info(id));
        this.publishTotal();
      }
    });

    this.deps.onState(this.info(id));
    void wc.loadURL(WHATSAPP_URL, { userAgent: this.deps.userAgent }).catch(() => {
      // failures are reported through did-fail-load
    });
    return entry;
  }

  private setState(id: string, entry: Entry, state: ViewState, errorCode?: number): void {
    if (this.entries.get(id) !== entry) return;
    entry.state = state;
    if (errorCode === undefined) delete entry.errorCode;
    else entry.errorCode = errorCode;
    entry.unread = state === 'ready' ? entry.titleUnread : null;
    this.deps.onState(this.info(id));
    this.publishTotal();
  }

  private publishTotal(): void {
    let total = 0;
    for (const e of this.entries.values()) total += e.unread ?? 0;
    this.deps.onTotalUnread(total);
  }
}
