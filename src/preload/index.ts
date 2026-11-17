import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel } from '../shared/channels';
import type { AppApi } from '../shared/ipc';

const api: AppApi = {
  app: {
    getVersion: () => ipcRenderer.invoke(IpcChannel.AppGetVersion) as Promise<string>,
    getLocale: () => ipcRenderer.invoke(IpcChannel.AppGetLocale) as Promise<string>,
  },
};

contextBridge.exposeInMainWorld('api', api);
