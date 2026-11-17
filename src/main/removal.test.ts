import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({}));

import { purgePartitionDirs } from './removal';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const C = '00000000-0000-4000-8000-000000000003';
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wam-purge-'));
  for (const id of [A, B, C])
    await mkdir(join(dir, 'Partitions', `account-${id}`), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('purgePartitionDirs', () => {
  it('removes pending and orphan dirs, keeps live ones', async () => {
    const done = await purgePartitionDirs(dir, new Set([A]), [B]);
    expect(done).toEqual([B]);
    expect(await readdir(join(dir, 'Partitions'))).toEqual([`account-${A}`]);
  });
  it('degraded: only pending ids, never orphans', async () => {
    await purgePartitionDirs(dir, new Set(), [B], true);
    expect((await readdir(join(dir, 'Partitions'))).sort()).toEqual([
      `account-${A}`,
      `account-${C}`,
    ]);
  });
});
