import { app, BrowserWindow, dialog, session } from 'electron';
import type { Session } from 'electron';
import { join } from 'node:path';
import { IpcEvent } from '../shared/ipc';
import { partitionFor } from '../shared/account';
import type { Account } from '../shared/account';
import { AccountStore } from './account-store';
import { hardenAccountSession } from './account-session';
import { APP_INDEX_URL, handleAppProtocol, registerAppScheme } from './app-protocol';
import { updateBadge } from './badge';
import { mediaPromptText } from './media-prompt';
import { createEmitter, registerIpc } from './ipc-handlers';
import { clearAccountSession, purgePartitionDirs } from './removal';
import { hardenSession, hardenWebContents } from './security';
import { chromiumUserAgent } from './user-agent';
import { ViewManager } from './view-manager';

app.enableSandbox();
registerAppScheme();

const devUrl = process.env['ELECTRON_RENDERER_URL'];
const rendererDir = join(__dirname, '../renderer');
const rendererIndexUrl = devUrl ?? APP_INDEX_URL;

let mainWindow: BrowserWindow | null = null;
let quitting = false;

const getWindow = (): BrowserWindow | null => mainWindow;
const emit = createEmitter(getWindow);

function createWindow(views: ViewManager): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  mainWindow = win;
  views.attachShortcuts(win.webContents);
  win.once('ready-to-show', () => {
    win.show();
    views.startKeepAlive();
  });
  win.on('closed', () => {
    views.closeAll();
    mainWindow = null;
  });
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[preload-error] ${preloadPath}: ${error.message}`);
  });

  void win.loadURL(rendererIndexUrl);
}

// Sessions of account partitions; their views are hardened by ViewManager.
const accountSessions = new Set<Session>();

app.on('web-contents-created', (_event, contents) => {
  if (contents.session === session.defaultSession) {
    hardenWebContents(contents);
  } else if (!accountSessions.has(contents.session)) {
    // Unknown session: deny-all baseline (no popups, no webview, no navigation).
    hardenWebContents(contents);
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(async () => {
    hardenSession(session.defaultSession);
    if (!devUrl) handleAppProtocol(rendererDir);
    if (devUrl) {
      // Dev only: Vite HMR needs inline scripts and websockets. Production uses the meta CSP.
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:*; object-src 'none'",
            ],
          },
        });
      });
    }

    const userData = app.getPath('userData');
    const store = new AccountStore(userData);
    const degraded = await store.load();
    // Only delete partitions explicitly queued for removal. Never infer orphans from the list:
    // a missing/corrupt accounts.json would otherwise wipe every session.
    const purged = await purgePartitionDirs(
      userData,
      new Set(store.list().map((a) => a.id)),
      store.pendingPurge(),
      true,
    );
    if (!degraded) await store.clearPurged(purged);

    const userAgent = chromiumUserAgent();
    const hardened = new Set<string>();
    const openPrompts = new Set<string>();
    const prepareSession = (id: string): void => {
      if (hardened.has(id)) return;
      hardened.add(id);
      const ses = session.fromPartition(partitionFor(id));
      accountSessions.add(ses);
      hardenAccountSession(ses, id, {
        getAccount: (aid) => store.get(aid),
        userAgent,
        confirmMedia: async (account: Account, types: readonly string[]) => {
          if (openPrompts.has(account.id)) return false; // one open prompt per account
          openPrompts.add(account.id);
          try {
            const txt = mediaPromptText(app.getLocale(), account.name, types);
            const opts = {
              type: 'question' as const,
              buttons: [txt.allow, txt.deny],
              defaultId: 1,
              cancelId: 1,
              title: txt.title,
              message: txt.message,
              detail: txt.detail,
            };
            const win = mainWindow;
            const r =
              win && !win.isDestroyed()
                ? await dialog.showMessageBox(win, opts)
                : await dialog.showMessageBox(opts);
            return r.response === 0;
          } finally {
            openPrompts.delete(account.id);
          }
        },
      });
    };
    store.list().forEach((a) => prepareSession(a.id));

    const views = new ViewManager({
      getWindow,
      listAccounts: () => store.list(),
      getAccount: (id) => store.get(id),
      userAgent,
      prepareSession,
      onState: (info) => emit(IpcEvent.ViewState, info),
      onActive: (id) => emit(IpcEvent.ViewActive, { id }),
      onTotalUnread: (total) => updateBadge(total, mainWindow),
    });

    registerIpc(
      {
        getWindow,
        rendererIndexUrl,
        store,
        views,
        appVersion: () => app.getVersion(),
        appLocale: () => app.getLocale(),
        wipeAccount: async (id) => {
          views.destroy(id, true);
          await clearAccountSession(session.fromPartition(partitionFor(id)));
        },
      },
      emit,
    );

    app.on('before-quit', (event) => {
      if (quitting) return;
      quitting = true;
      event.preventDefault();
      views.closeAll();
      void store.flush().finally(() => app.quit());
    });

    createWindow(views);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(views);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
