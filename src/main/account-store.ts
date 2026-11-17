import { randomUUID } from 'node:crypto';
import { copyFile, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { AccountSchema, MAX_ACCOUNTS } from '../shared/account';
import type { Account, AccountCreate, AccountPatch } from '../shared/account';
import type { IpcErrorCode } from '../shared/channels';

/** Rejects with message = code (NOT_FOUND | LIMIT_REACHED | INVALID). */
export class IpcError extends Error {
  constructor(readonly code: IpcErrorCode) {
    super(code);
    this.name = 'IpcError';
  }
}

const FileSchema = z
  .object({
    version: z.literal(1),
    accounts: z.array(AccountSchema),
    pendingPurge: z.array(z.uuid()).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.accounts.length > MAX_ACCOUNTS) {
      ctx.addIssue({ code: 'custom', message: 'too many accounts' });
    }
    if (new Set(v.accounts.map((a) => a.id)).size !== v.accounts.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate account ids' });
    }
  });

type ReadResult =
  | { kind: 'ok'; data: z.infer<typeof FileSchema> }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'io' };

export interface AccountStoreOptions {
  /** Test seams. */
  now?: () => Date;
  newId?: () => string;
  renameFile?: (from: string, to: string) => Promise<void>;
  log?: (msg: string) => void;
  retryDelayMs?: number;
}

const RETRYABLE = new Set(['EPERM', 'EBUSY']);

/** Metadata-only account persistence (accounts.json). Never touches session data. */
export class AccountStore {
  private accounts: Account[] = [];
  private pending: string[] = [];
  private degraded = false;
  private queue: Promise<void> = Promise.resolve();
  private readonly file: string;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly renameFile: (from: string, to: string) => Promise<void>;
  private readonly log: (msg: string) => void;
  private readonly retryDelayMs: number;

  constructor(
    private readonly dir: string,
    opts: AccountStoreOptions = {},
  ) {
    this.file = join(dir, 'accounts.json');
    this.now = opts.now ?? (() => new Date());
    this.newId = opts.newId ?? randomUUID;
    this.renameFile = opts.renameFile ?? rename;
    this.log = opts.log ?? ((m) => console.warn(m));
    this.retryDelayMs = opts.retryDelayMs ?? 50;
  }

  /**
   * Loads accounts.json. Returns true when degraded: the file could not be read because of an
   * I/O error (after retries). While degraded the list is empty, nothing is renamed and nothing
   * is persisted; callers must not delete data based on the (empty) list.
   */
  async load(): Promise<boolean> {
    this.degraded = false;
    const primary = await this.readWithRetry(this.file);
    if (primary.kind === 'io') return this.enterDegraded();
    if (primary.kind === 'ok') {
      this.adopt(primary.data);
      return false;
    }
    if (primary.kind === 'invalid') {
      const dest = `${this.file}.corrupt-${this.now().getTime()}`;
      this.log(`accounts.json invalid, moving to ${dest}`);
      await rename(this.file, dest).catch(() => undefined);
    }
    const bak = await this.readWithRetry(`${this.file}.bak`);
    if (bak.kind === 'io') return this.enterDegraded();
    if (bak.kind === 'ok') {
      this.log('accounts.json restored from .bak');
      this.adopt(bak.data);
      return false;
    }
    this.accounts = [];
    this.pending = [];
    return false;
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  private enterDegraded(): boolean {
    this.log('accounts.json unreadable (I/O error), entering degraded mode');
    this.degraded = true;
    this.accounts = [];
    this.pending = [];
    return true;
  }

  private async readWithRetry(path: string): Promise<ReadResult> {
    let r = await this.tryRead(path);
    for (let i = 1; r.kind === 'io' && i <= 3; i++) {
      await new Promise((res) => setTimeout(res, this.retryDelayMs * i));
      r = await this.tryRead(path);
    }
    return r;
  }

  private async tryRead(path: string): Promise<ReadResult> {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === 'ENOENT' ? { kind: 'missing' } : { kind: 'io' };
    }
    try {
      const r = FileSchema.safeParse(JSON.parse(text));
      return r.success ? { kind: 'ok', data: r.data } : { kind: 'invalid' };
    } catch {
      return { kind: 'invalid' };
    }
  }

  private adopt(data: z.infer<typeof FileSchema>): void {
    this.accounts = [...data.accounts].sort((a, b) => a.order - b.order);
    this.accounts.forEach((a, i) => (a.order = i));
    this.pending = [...data.pendingPurge];
  }

  list(): Account[] {
    return this.accounts.map((a) => ({ ...a }));
  }

  get(id: string): Account | undefined {
    const a = this.accounts.find((x) => x.id === id);
    return a ? { ...a } : undefined;
  }

  pendingPurge(): string[] {
    return [...this.pending];
  }

  async create(input: AccountCreate): Promise<Account> {
    this.assertWritable();
    if (this.accounts.length >= MAX_ACCOUNTS) throw new IpcError('LIMIT_REACHED');
    const parsed = AccountSchema.pick({ name: true, color: true }).safeParse(input);
    if (!parsed.success) throw new IpcError('INVALID');
    const account: Account = {
      id: this.newId(),
      name: parsed.data.name,
      color: parsed.data.color,
      order: this.accounts.length,
      createdAt: this.now().toISOString(),
      keepAlive: false,
      notifications: true,
    };
    this.accounts.push(account);
    await this.persist();
    return { ...account };
  }

  async update(id: string, patch: AccountPatch): Promise<Account> {
    this.assertWritable();
    const a = this.accounts.find((x) => x.id === id);
    if (!a) throw new IpcError('NOT_FOUND');
    Object.assign(a, patch);
    await this.persist();
    return { ...a };
  }

  /** Removes the record and queues its partition dir for purge on next startup. */
  async remove(id: string): Promise<void> {
    this.assertWritable();
    const idx = this.accounts.findIndex((x) => x.id === id);
    if (idx < 0) throw new IpcError('NOT_FOUND');
    this.accounts.splice(idx, 1);
    this.accounts.forEach((a, i) => (a.order = i));
    if (!this.pending.includes(id)) this.pending.push(id);
    await this.persist();
  }

  async reorder(ids: string[]): Promise<Account[]> {
    this.assertWritable();
    const current = new Set(this.accounts.map((a) => a.id));
    if (
      ids.length !== current.size ||
      new Set(ids).size !== ids.length ||
      !ids.every((i) => current.has(i))
    ) {
      throw new IpcError('INVALID');
    }
    const byId = new Map(this.accounts.map((a) => [a.id, a]));
    this.accounts = ids.map((id, i) => {
      const a = byId.get(id) as Account;
      a.order = i;
      return a;
    });
    await this.persist();
    return this.list();
  }

  async clearPurged(ids: string[]): Promise<void> {
    this.assertWritable();
    const before = this.pending.length;
    this.pending = this.pending.filter((i) => !ids.includes(i));
    if (this.pending.length !== before) await this.persist();
  }

  private assertWritable(): void {
    if (this.degraded) throw new IpcError('INVALID');
  }

  /** Resolves when all queued writes have finished. */
  flush(): Promise<void> {
    return this.queue;
  }

  private persist(): Promise<void> {
    if (this.degraded) return Promise.reject(new IpcError('INVALID'));
    const snapshot = JSON.stringify(
      { version: 1, accounts: this.accounts, pendingPurge: this.pending },
      null,
      2,
    );
    const run = this.queue.then(() => this.writeAtomic(snapshot));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async writeAtomic(content: string): Promise<void> {
    const tmp = `${this.file}.tmp`;
    const fh = await open(tmp, 'w');
    try {
      await fh.writeFile(content, 'utf8');
      await fh.sync();
    } finally {
      await fh.close();
    }
    await copyFile(this.file, `${this.file}.bak`).catch(() => undefined);
    try {
      await this.renameWithRetry(tmp, this.file);
    } catch (e) {
      await rm(tmp, { force: true }).catch(() => undefined);
      throw e;
    }
  }

  private async renameWithRetry(from: string, to: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.renameFile(from, to);
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code ?? '';
        if (attempt >= 3 || !RETRYABLE.has(code)) throw e;
        await new Promise((r) => setTimeout(r, this.retryDelayMs * (attempt + 1)));
      }
    }
  }
}
