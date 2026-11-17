/** Channel and event names. Dependency-free so the sandboxed preload can bundle it. */
export const IpcChannel = {
  AppGetVersion: 'app:get-version',
  AppGetLocale: 'app:get-locale',
  AccountsList: 'accounts:list',
  AccountsCreate: 'accounts:create',
  AccountsUpdate: 'accounts:update',
  AccountsRemove: 'accounts:remove',
  AccountsReorder: 'accounts:reorder',
  ViewActivate: 'view:activate',
  ViewSetBounds: 'view:set-bounds',
  ViewReload: 'view:reload',
  ViewGetStates: 'view:get-states',
  ViewGetActive: 'view:get-active',
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

/** Main -> renderer events. */
export const IpcEvent = {
  AccountsChanged: 'accounts:changed',
  ViewState: 'view:state',
  ViewActive: 'view:active',
} as const;

export type IpcEventName = (typeof IpcEvent)[keyof typeof IpcEvent];

/** Error codes carried in the message of rejected invokes. */
export type IpcErrorCode = 'NOT_FOUND' | 'LIMIT_REACHED' | 'INVALID';
