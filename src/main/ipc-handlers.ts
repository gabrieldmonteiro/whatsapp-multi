import { ipcMain } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { IpcChannel, IpcEvent, eventSchemas } from '../shared/ipc';
import type {
  AppEventName,
  AppEventPayload,
  IpcChannelName,
  IpcRequest,
  IpcResponse,
} from '../shared/ipc';
import type { Account } from '../shared/account';
import type { AccountStore } from './account-store';
import { invokeValidated, isTrustedSender } from './ipc-guard';
import type { ViewManager } from './view-manager';

export interface IpcDeps {
  getWindow: () => BrowserWindow | null;
  rendererIndexUrl: string;
  store: AccountStore;
  views: ViewManager;
  appVersion: () => string;
  appLocale: () => string;
  /** Destroys the view and clears Chromium-managed session data for the account. */
  wipeAccount: (id: string) => Promise<void>;
}

/** Sends a validated event to the main window only. */
export function createEmitter(getWindow: () => BrowserWindow | null) {
  return function emit<E extends AppEventName>(event: E, payload: AppEventPayload<E>): void {
    const win = getWindow();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send(event, eventSchemas[event].parse(payload));
  };
}

export type Emit = ReturnType<typeof createEmitter>;

export function registerIpc(deps: IpcDeps, emit: Emit): void {
  function handle<C extends IpcChannelName>(
    channel: C,
    impl: (...args: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>,
  ): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const win = deps.getWindow();
      const isMainFrame =
        win !== null &&
        !win.isDestroyed() &&
        event.senderFrame !== null &&
        event.senderFrame === win.webContents.mainFrame;
      if (!isTrustedSender(event.senderFrame?.url, deps.rendererIndexUrl, isMainFrame)) {
        throw new Error('Untrusted IPC sender');
      }
      return invokeValidated(channel, args, impl);
    });
  }

  const changed = (): Account[] => {
    const list = deps.store.list();
    emit(IpcEvent.AccountsChanged, list);
    return list;
  };

  handle(IpcChannel.AppGetVersion, () => deps.appVersion());
  handle(IpcChannel.AppGetLocale, () => deps.appLocale());

  handle(IpcChannel.AccountsList, () => deps.store.list());
  handle(IpcChannel.AccountsCreate, async (input) => {
    const a = await deps.store.create(input);
    changed();
    return a;
  });
  handle(IpcChannel.AccountsUpdate, async ({ id, patch }) => {
    const a = await deps.store.update(id, patch);
    deps.views.onAccountUpdated(a);
    changed();
    return a;
  });
  handle(IpcChannel.AccountsRemove, async ({ id }) => {
    if (!deps.store.get(id)) throw new Error('NOT_FOUND');
    const before = deps.store.list();
    const idx = before.findIndex((a) => a.id === id);
    const wasActive = deps.views.getActive() === id;
    await deps.wipeAccount(id);
    await deps.store.remove(id);
    changed();
    if (wasActive) {
      const rest = deps.store.list();
      const next = rest[idx] ?? rest[idx - 1]; // next by order, else previous if it was last
      deps.views.activate(next ? next.id : null);
    }
  });
  handle(IpcChannel.AccountsReorder, async ({ ids }) => {
    const list = await deps.store.reorder(ids);
    emit(IpcEvent.AccountsChanged, list);
    return list;
  });

  handle(IpcChannel.ViewActivate, ({ id }) => deps.views.activate(id));
  handle(IpcChannel.ViewSetBounds, (b) => deps.views.setBounds(b));
  handle(IpcChannel.ViewReload, ({ id }) => deps.views.reload(id));
  handle(IpcChannel.ViewGetStates, () => deps.views.getStates());
  handle(IpcChannel.ViewGetActive, () => deps.views.getActive());
}
