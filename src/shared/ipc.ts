import { z } from 'zod';

import { IpcChannel } from './channels';
import type { IpcChannelName } from './channels';

export { IpcChannel };
export type { IpcChannelName };

/** Per-channel request (zod schema of the args tuple) and response schemas. */
export const ipcSchemas = {
  [IpcChannel.AppGetVersion]: { request: z.tuple([]), response: z.string() },
  [IpcChannel.AppGetLocale]: { request: z.tuple([]), response: z.string() },
} as const satisfies Record<IpcChannelName, { request: z.ZodType<unknown[]>; response: z.ZodType }>;

export type IpcRequest<C extends IpcChannelName> = z.infer<(typeof ipcSchemas)[C]['request']>;
export type IpcResponse<C extends IpcChannelName> = z.infer<(typeof ipcSchemas)[C]['response']>;

/** API exposed on window.api by the preload script. */
export interface AppApi {
  app: {
    getVersion(): Promise<string>;
    getLocale(): Promise<string>;
  };
}
