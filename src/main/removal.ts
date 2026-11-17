import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Session } from 'electron';

const PARTITION_DIR = /^account-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Deletes Partitions/account-<uuid> dirs that are pending purge or orphaned (no record).
 * Must run before any session exists for them. Returns the pending ids that are now done.
 */
export async function purgePartitionDirs(
  userDataDir: string,
  liveIds: ReadonlySet<string>,
  pending: readonly string[],
  /** True when the account list could not be loaded: never delete orphans then. */
  skipOrphans = false,
): Promise<string[]> {
  const root = join(userDataDir, 'Partitions');
  const pendingSet = new Set(pending.map((p) => p.toLowerCase()));
  const live = new Set([...liveIds].map((p) => p.toLowerCase()));
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [...pending];
  }
  const done: string[] = [];
  for (const name of names) {
    const m = PARTITION_DIR.exec(name);
    if (!m) continue;
    const id = (m[1] ?? '').toLowerCase();
    if (!pendingSet.has(id) && (skipOrphans || live.has(id))) continue;
    try {
      await rm(join(root, name), { recursive: true, force: true });
    } catch {
      // stays pending (dir still exists), retried next startup
    }
  }
  for (const p of pending) {
    if (!(await exists(join(root, `account-${p}`)))) done.push(p);
  }
  return done;
}

async function exists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

/** Clears Chromium-managed data for a partition through the public session API only. */
export async function clearAccountSession(ses: Session): Promise<void> {
  await ses.clearStorageData();
  await ses.clearCache();
  await ses.clearAuthCache();
}
