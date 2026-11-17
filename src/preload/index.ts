import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { IpcChannel, IpcEvent } from '../shared/channels';
import type { AppApi, AppEventName, AppEventPayload } from '../shared/ipc';

const EVENT_NAMES: readonly string[] = Object.values(IpcEvent);

const api: AppApi = {
  app: {
    getVersion: () => ipcRenderer.invoke(IpcChannel.AppGetVersion) as Promise<string>,
    getLocale: () => ipcRenderer.invoke(IpcChannel.AppGetLocale) as Promise<string>,
  },
  accounts: {
    list: () => ipcRenderer.invoke(IpcChannel.AccountsList),
    create: (input) => ipcRenderer.invoke(IpcChannel.AccountsCreate, input),
    update: (id, patch) => ipcRenderer.invoke(IpcChannel.AccountsUpdate, { id, patch }),
    remove: (id) => ipcRenderer.invoke(IpcChannel.AccountsRemove, { id }),
    reorder: (ids) => ipcRenderer.invoke(IpcChannel.AccountsReorder, { ids }),
  },
  view: {
    activate: (id) => ipcRenderer.invoke(IpcChannel.ViewActivate, { id }),
    setBounds: (b) => ipcRenderer.invoke(IpcChannel.ViewSetBounds, b),
    reload: (id) => ipcRenderer.invoke(IpcChannel.ViewReload, { id }),
    getStates: () => ipcRenderer.invoke(IpcChannel.ViewGetStates),
    getActive: () => ipcRenderer.invoke(IpcChannel.ViewGetActive),
  },
  on<E extends AppEventName>(event: E, cb: (payload: AppEventPayload<E>) => void): () => void {
    if (!EVENT_NAMES.includes(event)) throw new Error('Unknown event');
    const listener = (_e: IpcRendererEvent, payload: unknown): void =>
      cb(payload as AppEventPayload<E>);
    ipcRenderer.on(event, listener);
    return () => {
      ipcRenderer.removeListener(event, listener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
