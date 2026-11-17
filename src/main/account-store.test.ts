import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountStore } from './account-store';

let dir: string;
const quiet = { log: () => undefined, retryDelayMs: 1 };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wam-store-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('AccountStore', () => {
  it('starts empty and persists create/update/reorder/remove', async () => {
    const s = new AccountStore(dir, quiet);
    await s.load();
    expect(s.list()).toEqual([]);
    const a = await s.create({ name: ' A ', color: 'green' });
    const b = await s.create({ name: 'B', color: 'blue' });
    expect(a.name).toBe('A');
    expect([a.order, b.order]).toEqual([0, 1]);
    expect(a.keepAlive).toBe(false);
    expect(a.notifications).toBe(true);
    const u = await s.update(a.id, { keepAlive: true });
    expect(u.keepAlive).toBe(true);
    await s.reorder([b.id, a.id]);
    expect(s.list().map((x) => x.id)).toEqual([b.id, a.id]);
    await s.remove(b.id);
    expect(s.list().map((x) => x.order)).toEqual([0]);
    expect(s.pendingPurge()).toEqual([b.id]);

    const s2 = new AccountStore(dir, quiet);
    await s2.load();
    expect(s2.list()).toEqual(s.list());
    expect(s2.pendingPurge()).toEqual([b.id]);
  });

  it('rejects bad input with codes', async () => {
    const s = new AccountStore(dir, quiet);
    await s.load();
    await expect(s.update('00000000-0000-4000-8000-000000000000', {})).rejects.toThrow('NOT_FOUND');
    await expect(s.remove('00000000-0000-4000-8000-000000000000')).rejects.toThrow('NOT_FOUND');
    const a = await s.create({ name: 'A', color: 'red' });
    await expect(s.reorder([a.id, a.id])).rejects.toThrow('INVALID');
    await expect(s.reorder([])).rejects.toThrow('INVALID');
    for (let i = 1; i < 10; i++) await s.create({ name: `n${i}`, color: 'gray' });
    await expect(s.create({ name: 'x', color: 'gray' })).rejects.toThrow('LIMIT_REACHED');
  });

  it('moves a corrupt file aside and starts empty', async () => {
    await writeFile(join(dir, 'accounts.json'), '{not json');
    const s = new AccountStore(dir, { ...quiet, now: () => new Date(1234) });
    await s.load();
    expect(s.list()).toEqual([]);
    const names = await readdir(dir);
    expect(names).toContain('accounts.json.corrupt-1234');
    expect(names).not.toContain('accounts.json');
  });

  it('rejects schema-invalid file and falls back to .bak', async () => {
    const good = new AccountStore(dir, quiet);
    await good.load();
    await good.create({ name: 'A', color: 'teal' });
    await good.create({ name: 'B', color: 'teal' }); // .bak now holds the 1-account version
    await writeFile(
      join(dir, 'accounts.json'),
      JSON.stringify({ version: 1, accounts: [{ id: 1 }] }),
    );
    const s = new AccountStore(dir, quiet);
    await s.load();
    expect(s.list().map((a) => a.name)).toEqual(['A']);
  });

  it('writes atomically: no tmp left, .bak keeps previous, stale tmp ignored', async () => {
    await writeFile(join(dir, 'accounts.json.tmp'), 'garbage');
    const s = new AccountStore(dir, quiet);
    await s.load();
    await s.create({ name: 'A', color: 'pink' });
    await s.create({ name: 'B', color: 'pink' });
    const names = await readdir(dir);
    expect(names).not.toContain('accounts.json.tmp');
    const bak = JSON.parse(await readFile(join(dir, 'accounts.json.bak'), 'utf8')) as {
      accounts: unknown[];
    };
    const cur = JSON.parse(await readFile(join(dir, 'accounts.json'), 'utf8')) as {
      accounts: unknown[];
    };
    expect(bak.accounts).toHaveLength(1);
    expect(cur.accounts).toHaveLength(2);
  });

  it('retries EPERM on rename and leaves the original intact when it keeps failing', async () => {
    let calls = 0;
    const flaky = new AccountStore(dir, {
      ...quiet,
      renameFile: async () => {
        calls++;
        throw Object.assign(new Error('locked'), { code: 'EPERM' });
      },
    });
    await flaky.load();
    await expect(flaky.create({ name: 'A', color: 'red' })).rejects.toThrow('locked');
    expect(calls).toBe(4);
    expect(await readdir(dir)).not.toContain('accounts.json.tmp');
  });

  it('serialises concurrent writes', async () => {
    const s = new AccountStore(dir, quiet);
    await s.load();
    await Promise.all([1, 2, 3, 4].map((i) => s.create({ name: `n${i}`, color: 'blue' })));
    await s.flush();
    const s2 = new AccountStore(dir, quiet);
    await s2.load();
    expect(s2.list()).toHaveLength(4);
  });
});

describe('AccountStore degraded and validation', () => {
  const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const acct = (n: number): Record<string, unknown> => ({
    id: uuid(n),
    name: `a${n}`,
    color: 'green',
    order: n,
    createdAt: new Date(0).toISOString(),
    keepAlive: false,
    notifications: true,
  });

  it('treats a non-ENOENT read error as degraded: no rename, no persist', async () => {
    // A directory at accounts.json makes readFile fail with EISDIR (an I/O error, not ENOENT).
    await mkdir(join(dir, 'accounts.json'));
    const s = new AccountStore(dir, quiet);
    expect(await s.load()).toBe(true);
    expect(s.isDegraded()).toBe(true);
    expect(s.list()).toEqual([]);
    expect(await readdir(dir)).toEqual(['accounts.json']); // not renamed
    await expect(s.create({ name: 'A', color: 'red' })).rejects.toThrow('INVALID');
    expect(s.list()).toEqual([]);
    await rm(join(dir, 'accounts.json'), { recursive: true });
    expect(await s.load()).toBe(false); // recovers once readable
    await s.create({ name: 'A', color: 'red' });
  });

  it('is not degraded for a missing file or a corrupt file', async () => {
    expect(await new AccountStore(dir, quiet).load()).toBe(false);
    await writeFile(join(dir, 'accounts.json'), 'x');
    expect(await new AccountStore(dir, quiet).load()).toBe(false);
  });

  it('rejects duplicate ids and more than MAX_ACCOUNTS', async () => {
    await writeFile(
      join(dir, 'accounts.json'),
      JSON.stringify({ version: 1, accounts: [acct(1), { ...acct(2), id: uuid(1) }] }),
    );
    const s = new AccountStore(dir, quiet);
    await s.load();
    expect(s.list()).toEqual([]);
    expect((await readdir(dir)).some((n) => n.startsWith('accounts.json.corrupt-'))).toBe(true);

    const dir2 = await mkdtemp(join(tmpdir(), 'wam-store-'));
    await writeFile(
      join(dir2, 'accounts.json'),
      JSON.stringify({ version: 1, accounts: Array.from({ length: 11 }, (_, i) => acct(i + 1)) }),
    );
    const s2 = new AccountStore(dir2, quiet);
    await s2.load();
    expect(s2.list()).toEqual([]);
    await rm(dir2, { recursive: true, force: true });
  });
});
