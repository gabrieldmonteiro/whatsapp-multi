import type { Session } from 'electron';
import type { Account } from '../shared/account';

/** Permissions are granted only to the exact WhatsApp Web origin (navigation uses the wider list). */
export function isGrantOrigin(url: string): boolean {
  try {
    return new URL(url).origin === 'https://web.whatsapp.com';
  } catch {
    return false;
  }
}

export type PermissionDecision = 'grant' | 'deny' | 'ask-media';

/** Pure permission policy for request handlers. */
export function decidePermission(
  permission: string,
  url: string,
  account: Pick<Account, 'notifications'> | undefined,
): PermissionDecision {
  if (!account || !isGrantOrigin(url)) return 'deny';
  switch (permission) {
    case 'notifications':
      return account.notifications ? 'grant' : 'deny';
    case 'clipboard-sanitized-write':
      return 'grant';
    case 'media':
      return 'ask-media';
    default:
      return 'deny';
  }
}

/** Pure policy for check handlers (no prompts, media is never pre-granted). */
export function checkPermission(
  permission: string,
  url: string,
  account: Pick<Account, 'notifications'> | undefined,
): boolean {
  return decidePermission(permission, url, account) === 'grant';
}

export interface AccountSessionDeps {
  /** Read on each request so toggles apply immediately. */
  getAccount: (id: string) => Account | undefined;
  /** Asks the user (main-process dialog). Nothing is persisted. */
  confirmMedia: (account: Account, mediaTypes: readonly string[]) => Promise<boolean>;
  userAgent: string;
}

export function hardenAccountSession(
  ses: Session,
  accountId: string,
  deps: AccountSessionDeps,
): void {
  ses.setUserAgent(deps.userAgent);

  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const url = details.requestingUrl;
    const account = deps.getAccount(accountId);
    const decision = decidePermission(permission, url, account);
    if (decision === 'ask-media' && account) {
      const types =
        'mediaTypes' in details && Array.isArray(details.mediaTypes)
          ? (details.mediaTypes as string[])
          : [];
      deps.confirmMedia(account, types).then(
        (ok) => callback(ok),
        () => callback(false),
      );
      return;
    }
    callback(decision === 'grant');
  });

  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    checkPermission(permission, requestingOrigin, deps.getAccount(accountId)),
  );
}
