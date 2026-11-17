import { z } from 'zod';

import { IpcChannel, IpcEvent } from './channels';
import type { IpcChannelName, IpcEventName } from './channels';
import {
  AccountCreateSchema,
  AccountPatchSchema,
  AccountSchema,
  BoundsSchema,
  ViewInfoSchema,
} from './account';
import type { Account, AccountCreate, AccountPatch, Bounds, ViewInfo } from './account';

export { IpcChannel, IpcEvent };
export type { IpcChannelName, IpcEventName };

const idArg = z.object({ id: z.uuid() });

/** Per-channel request (zod schema of the args tuple) and response schemas. */
export const ipcSchemas = {
  [IpcChannel.AppGetVersion]: { request: z.tuple([]), response: z.string() },
  [IpcChannel.AppGetLocale]: { request: z.tuple([]), response: z.string() },
  [IpcChannel.AccountsList]: { request: z.tuple([]), response: z.array(AccountSchema) },
  [IpcChannel.AccountsCreate]: { request: z.tuple([AccountCreateSchema]), response: AccountSchema },
  [IpcChannel.AccountsUpdate]: {
    request: z.tuple([z.object({ id: z.uuid(), patch: AccountPatchSchema })]),
    response: AccountSchema,
  },
  [IpcChannel.AccountsRemove]: { request: z.tuple([idArg]), response: z.void() },
  [IpcChannel.AccountsReorder]: {
    request: z.tuple([z.object({ ids: z.array(z.uuid()) })]),
    response: z.array(AccountSchema),
  },
  [IpcChannel.ViewActivate]: {
    request: z.tuple([z.object({ id: z.uuid().nullable() })]),
    response: z.void(),
  },
  [IpcChannel.ViewSetBounds]: { request: z.tuple([BoundsSchema.nullable()]), response: z.void() },
  [IpcChannel.ViewReload]: { request: z.tuple([idArg]), response: z.void() },
  [IpcChannel.ViewGetStates]: { request: z.tuple([]), response: z.array(ViewInfoSchema) },
  [IpcChannel.ViewGetActive]: { request: z.tuple([]), response: z.uuid().nullable() },
} as const satisfies Record<IpcChannelName, { request: z.ZodType<unknown[]>; response: z.ZodType }>;

export type IpcRequest<C extends IpcChannelName> = z.infer<(typeof ipcSchemas)[C]['request']>;
export type IpcResponse<C extends IpcChannelName> = z.infer<(typeof ipcSchemas)[C]['response']>;

/** Main -> renderer event payload schemas. */
export const eventSchemas = {
  [IpcEvent.AccountsChanged]: z.array(AccountSchema),
  [IpcEvent.ViewState]: ViewInfoSchema,
  [IpcEvent.ViewActive]: z.object({ id: z.uuid().nullable() }),
} as const satisfies Record<IpcEventName, z.ZodType>;

export type AppEventName = IpcEventName;
export type AppEventPayload<E extends AppEventName> = z.infer<(typeof eventSchemas)[E]>;

/** API exposed on window.api by the preload script. */
export interface AppApi {
  app: {
    getVersion(): Promise<string>;
    getLocale(): Promise<string>;
  };
  accounts: {
    list(): Promise<Account[]>;
    create(input: AccountCreate): Promise<Account>;
    update(id: string, patch: AccountPatch): Promise<Account>;
    remove(id: string): Promise<void>;
    reorder(ids: string[]): Promise<Account[]>;
  };
  view: {
    activate(id: string | null): Promise<void>;
    setBounds(b: Bounds | null): Promise<void>;
    reload(id: string): Promise<void>;
    getStates(): Promise<ViewInfo[]>;
    getActive(): Promise<string | null>;
  };
  /** Returns an unsubscribe function. */
  on<E extends AppEventName>(event: E, cb: (payload: AppEventPayload<E>) => void): () => void;
}
