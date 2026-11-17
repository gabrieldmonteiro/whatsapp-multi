import { app, BrowserWindow, ipcMain, session } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { IpcChannel, ipcSchemas } from '../shared/ipc';
import type { IpcChannelName, IpcRequest, IpcResponse } from '../shared/ipc';
import { isTrustedSender, validateInput } from './ipc-guard';
import { APP_INDEX_URL, handleAppProtocol, registerAppScheme } from './app-protocol';
import { hardenSession, hardenWebContents } from './security';

app.enableSandbox();
registerAppScheme();

const devUrl = process.env['ELECTRON_RENDERER_URL'];
const rendererDir = join(__dirname, '../renderer');
const rendererIndexUrl = devUrl ?? APP_INDEX_URL;

let mainWindow: BrowserWindow | null = null;

function handle<C extends IpcChannelName>(
  channel: C,
  impl: (...args: IpcRequest<C>) => IpcResponse<C>,
): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    const isMainFrame =
      mainWindow !== null &&
      !mainWindow.isDestroyed() &&
      event.senderFrame !== null &&
      event.senderFrame === mainWindow.webContents.mainFrame;
    if (!isTrustedSender(event.senderFrame?.url, rendererIndexUrl, isMainFrame)) {
      throw new Error('Untrusted IPC sender');
    }
    const parsed = validateInput(ipcSchemas[channel].request, args) as IpcRequest<C>;
    return ipcSchemas[channel].response.parse(impl(...parsed)) as IpcResponse<C>;
  });
}

function registerIpc(): void {
  handle(IpcChannel.AppGetVersion, () => app.getVersion());
  handle(IpcChannel.AppGetLocale, () => app.getLocale());
}

function createWindow(): void {
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
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
  });
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[preload-error] ${preloadPath}: ${error.message}`);
  });

  void win.loadURL(rendererIndexUrl);
}

app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
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
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
