/** Channel names. Dependency-free so the sandboxed preload can bundle it. */
export const IpcChannel = {
  AppGetVersion: 'app:get-version',
  AppGetLocale: 'app:get-locale',
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];
