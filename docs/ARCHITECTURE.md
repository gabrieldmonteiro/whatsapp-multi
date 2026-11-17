# Architecture (Phases 3–4)

Constraint (docs/FEASIBILITY.md): each account is the unmodified `https://web.whatsapp.com` in its own `WebContentsView` with partition `persist:account-<uuid>`. No preload, script injection, DOM access, automation, or session reading/export on account views.

## 1. Module layout and ownership

| Path | Owner | Contents |
|---|---|---|
| `src/shared/channels.ts` | developer | Channel + event names (no dependencies) |
| `src/shared/account.ts` | developer | `AccountSchema`, `AccountPatchSchema`, `ViewStateSchema`, `BoundsSchema` |
| `src/shared/ipc.ts` | developer | `ipcSchemas`, `eventSchemas`, `AppApi` |
| `src/main/index.ts` | developer | Startup wiring only |
| `src/main/account-store.ts` | developer | `AccountStore`: JSON persistence, CRUD, ordering |
| `src/main/view-manager.ts` | developer | `ViewManager`: view lifecycle, attach/detach, bounds, state, unread |
| `src/main/account-session.ts` | developer | `hardenAccountSession(ses, account)`: permissions, UA, allowlist |
| `src/main/user-agent.ts` | developer | `chromiumUserAgent()` |
| `src/main/ipc-handlers.ts` | developer | `registerIpc(deps)`: zod-validated handlers, event broadcast |
| `src/main/security.ts` | developer + security-reviewer | Existing guards plus the `WHATSAPP_HOSTS` constant |
| `src/preload/index.ts`, `index.d.ts` | developer | Implements `AppApi` with `invoke` plus typed `on()` |
| `src/renderer/**` | ui-ux | All React code: `state/`, `components/`, `i18n/` |

Rules:
- The renderer imports only types from `src/shared/*` and calls `window.api`. It never imports from main or preload.
- `src/shared/*` is the contract. Changes to it need architect sign-off. ui-ux can mock `window.api` (an `api.mock.ts` in the renderer) and doesn't have to wait for main.
- Renderer state uses React context + `useReducer` (or `useSyncExternalStore`) fed by `accounts:changed` / `view:state` events. Main is the source of truth and the renderer doesn't update optimistically. No new state library.

## 2. Account model and persistence

```ts
// src/shared/account.ts
export const ACCOUNT_COLORS = ['green','teal','blue','violet','pink','red','orange','yellow','gray'] as const;
export const AccountSchema = z.object({
  id: z.uuid(),                              // crypto.randomUUID() in main only
  name: z.string().trim().min(1).max(40),
  color: z.enum(ACCOUNT_COLORS),             // palette token; renderer maps it to a theme color
  order: z.number().int().min(0),            // dense 0..n-1, main renumbers
  createdAt: z.iso.datetime(),
  keepAlive: z.boolean(),                    // default false: may be destroyed when inactive
  notifications: z.boolean(),                // default true: grants the Notification permission
});
export type Account = z.infer<typeof AccountSchema>;
export const AccountCreateSchema = AccountSchema.pick({ name: true, color: true });
export const AccountPatchSchema = AccountSchema.pick({ name:true, color:true, keepAlive:true, notifications:true }).partial().strict();
export const MAX_ACCOUNTS = 10;
export const partitionFor = (id: string) => `persist:account-${id}` as const;
```

**Decision: a JSON file, not better-sqlite3.** This replaces the SQLite entry in ROADMAP.md.
- Context: the store holds at most around 10 small records with no queries or concurrency. better-sqlite3 is a native module. It needs `electron-rebuild` for every Electron ABI, `asarUnpack`, and a matching prebuilt per arch in CI. It also makes the portable zip and NSIS packaging harder.
- Decision: store `app.getPath('userData')/accounts.json` = `{ version: 1, accounts: Account[] }`. Validate it with zod on load. Writes are atomic: write `accounts.json.tmp`, `fsync`, then `rename` over the target. On Windows, retry EPERM/EBUSY 3× with backoff, because antivirus can lock the file. Keep the previous file as `accounts.json.bak`. Serialise writes through one promise queue.
- Corrupt or invalid file: rename it to `accounts.json.corrupt-<ts>`, fall back to `.bak`, otherwise start empty, and log it.
- Metadata only. Cookies, IndexedDB and other session data stay in Chromium's `Partitions/account-<uuid>` and the app never reads them.
- Consequences: no new dependency and nothing to rebuild natively. Migrations are a `version` switch. ROADMAP.md must be updated.

## 3. IPC contract

All requests are renderer→main `invoke`. Each handler validates with `ipcSchemas[ch].request` (an args tuple) via the existing `isTrustedSender` + `validateInput` path. `handle()` must accept `impl` returning `T | Promise<T>`. Errors reject with `Error(code)`, where code ∈ `NOT_FOUND | LIMIT_REACHED | INVALID`.

| Channel | Request tuple | Response |
|---|---|---|
| `accounts:list` | `[]` | `Account[]` (sorted by `order`) |
| `accounts:create` | `[AccountCreateSchema]` | `Account` |
| `accounts:update` | `[z.object({ id: z.uuid(), patch: AccountPatchSchema })]` | `Account` |
| `accounts:remove` | `[z.object({ id: z.uuid() })]` | `z.void()` |
| `accounts:reorder` | `[z.object({ ids: z.array(z.uuid()) })]` (must be a permutation of all ids) | `Account[]` |
| `view:activate` | `[z.object({ id: z.uuid().nullable() })]` | `z.void()` |
| `view:set-bounds` | `[BoundsSchema.nullable()]` | `z.void()` |
| `view:reload` | `[z.object({ id: z.uuid() })]` | `z.void()` |
| `view:get-states` | `[]` | `z.array(ViewInfoSchema)` |

```ts
export const BoundsSchema = z.object({ x: z.number().int().min(0), y: z.number().int().min(0),
  width: z.number().int().min(0).max(16384), height: z.number().int().min(0).max(16384) });
export const ViewStateSchema = z.enum(['idle', 'loading', 'ready', 'error', 'crashed']);
// idle    = no live view (never created, or destroyed)
// loading = between did-start-loading and did-finish-load
// ready   = main frame loaded on an allowed host
// error   = did-fail-load (errorCode kept)
// crashed = render-process-gone
export const ViewInfoSchema = z.object({ id: z.uuid(), state: ViewStateSchema,
  unread: z.number().int().min(0).nullable(), errorCode: z.number().int().optional() });
```

Main→renderer events go over `mainWindow.webContents.send` only. They're schemas in `eventSchemas`, and main parses before sending.

| Event | Payload |
|---|---|
| `accounts:changed` | `Account[]` (full list after every mutation) |
| `view:state` | `ViewInfoSchema` (one account) |
| `view:active` | `{ id: uuid or null }` |

Preload API (no raw `ipcRenderer`):
```ts
interface AppApi {
  app: { getVersion(): Promise<string>; getLocale(): Promise<string> };
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
  };
  /** Returns an unsubscribe function. */
  on<E extends AppEventName>(event: E, cb: (payload: AppEventPayload<E>) => void): () => void;
}
```

**Unread badge: acceptable.** Main listens to the `page-title-updated` event on the view's `webContents`. WhatsApp sets its title to `(N) WhatsApp`. Main parses the leading `(N)`, so no count means 0, and `null` until the page is ready. This reads a standard browser event, just like a tab strip, with no injection. Main also sets the overall count with `app.setBadgeCount` (where supported) and the Windows taskbar overlay with `win.setOverlayIcon`.

**`needs-login` is not in the contract.** The app can't tell the QR screen apart from a logged-in screen without reading the DOM (injection), and the title and URL are the same either way. WhatsApp shows its own QR inside the view, so the renderer doesn't need this state. The wizard tells the user to scan the QR shown in the view, and the user closes it. A heuristic (treating an account that never had unread > 0 as logged out) was rejected as unreliable.

**View placement: the renderer reports bounds.** `AccountViewport` (renderer) is an empty div. A `ResizeObserver` plus window `resize` reads its `getBoundingClientRect()`, rounds it, and calls `view.setBounds`, throttled with rAF. Main clamps the rect to the window content size and applies it to the active view only. `setBounds(null)` hides the active view (`setVisible(false)`). The renderer must send `null` while any modal, menu or wizard step overlaps the viewport, because a `WebContentsView` always renders above the renderer DOM. Why not a fixed sidebar width in main: it breaks with zoom, header bars and overlays. Both sides already use DIPs, so no DPI conversion is needed.

## 4. Lifecycle (ViewManager)

- **Startup:** `AccountStore.load()`, then purge any pending partition dirs (see Removal), then `hardenAccountSession` for each partition. That's cheap and starts no renderer. Nothing loads until `view:activate` is called. Keep-alive accounts are created in the background after the window is shown, staggered by 2 s.
- **Lazy creation:** `new WebContentsView({ webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } })` with **no preload**. Then `hardenWebContents(wc, { navigationAllowlist: WHATSAPP_HOSTS })`, then `loadURL('https://web.whatsapp.com/', { userAgent })`.
- **Switching:** add the target with `win.contentView.addChildView(view)` (if it isn't attached yet), then `setBounds(lastBounds)` and `setVisible(true)`. The previous view gets `setVisible(false)` and stays attached, so there's no reload and no flicker. Then emit `view:active`. `activate(null)` hides everything.
- **Suspension/destroy:** an inactive account with `keepAlive=false` is destroyed after `IDLE_DESTROY_MS` (5 min): `removeChildView`, then `webContents.close()`, then state `idle`. Login survives because it's on disk. An inactive account with `keepAlive=true` stays alive and hidden, so it still gets notifications and unread counts. Turning `keepAlive` off on an inactive account starts the idle timer.
- **Crash:** on `render-process-gone`, set state `crashed`. The renderer offers `view:reload`, which recreates the view. There's no auto-retry loop.
- **Removal:**
  1. Destroy the view.
  2. Get `ses = session.fromPartition(p)`, then `await ses.clearStorageData()`, `ses.clearCache()` and `ses.clearAuthCache()`.
  3. Delete the record (atomic write), then emit `accounts:changed`.
  4. The open partition directory can't be deleted while it's in use, so add the id to `pendingPurge` in `accounts.json`. On the next startup, before any session exists for it, `fs.rm` `userData/Partitions/account-<uuid>` recursively. Also purge any `account-*` dir that has no matching record (orphans).
- **Quit:** on `before-quit`, flush the store's write queue and close the views. Chromium persists partitions itself, and the app never touches session data.

## 5. User agent

- `user-agent.ts` takes `app.userAgentFallback` and removes the `Electron/x` and app-name tokens. The result is the bundled Chromium UA (`... Chrome/<process.versions.chrome> Safari/537.36`).
- It's computed at runtime, so it stays in sync with Electron upgrades. It's never hard-coded to a spoofed version.
- It's applied in `hardenAccountSession` via `ses.setUserAgent(ua)`, which covers all requests and workers of that partition, and it's also passed to `loadURL`. It isn't applied to the default session or the app UI.

## 6. Session policy (`hardenAccountSession`, extends security.ts)

- `WHATSAPP_HOSTS = ['whatsapp.com', 'whatsapp.net']`, matched by the existing `isHostAllowed` (https only, exact or dot-suffix). Navigation and redirects outside the allowlist are blocked. `window.open` goes to `shell.openExternal` after `isSafeExternalUrl`.
- Permission request handler: deny by default, and only consider a permission when the requesting URL passes `isHostAllowed(url, WHATSAPP_HOSTS)`:
  - `notifications`: granted when `account.notifications` is on. The value is read from the store on each request, so toggling takes effect immediately.
  - `media`: a main-process `dialog.showMessageBox` names the account and the media types and asks the user each time. Nothing is persisted.
  - `clipboard-sanitized-write`: granted, because copying messages needs it.
  - Everything else is denied.
- Permission check handler: same origin rule. Returns true only for `notifications` (when the flag is on) and `clipboard-sanitized-write`.

## 7. Risks / open questions

1. **UA client hints:** the `Sec-CH-UA` brands may differ from Chrome's. If WhatsApp gates on client hints, we would need to rewrite those headers. That still isn't an auth bypass, but it needs security-reviewer sign-off first.
2. **Notification click:** HTML5 notifications from a hidden view don't switch accounts. Proposal: when an inactive view's webContents emits `focus` (WhatsApp focuses the window on click), activate that account. This has to be verified.
3. **Memory:** expect roughly 150–300 MB per live view. Proposal: warn when more than 3 accounts have `keepAlive` on. To be measured in Phase 5.
4. **Overlay z-order:** every renderer overlay has to call `setBounds(null)`. ui-ux provides one shared `useViewportOcclusion()` hook so this can't be forgotten.
5. **Removal durability:** if the app crashes between clearing storage and the purge, data remains until the orphan purge runs on the next startup.
6. **No reliable login state** without injection (see section 3). The UX relies on WhatsApp's own screen.
7. **ToS / linked-device limits** (FEASIBILITY risks 2–3): show an "unofficial, not affiliated" notice in the UI and README.
8. **Pending product decisions:** spellcheck languages, download location, and the `MAX_ACCOUNTS` value.
