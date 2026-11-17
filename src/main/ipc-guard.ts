import { z } from 'zod';

function normalize(url: string): string | null {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return u.href;
  } catch {
    return null;
  }
}

/**
 * True only if the sender is the main window's main frame AND its URL equals the
 * renderer index URL exactly (hash and query ignored).
 */
export function isTrustedSender(
  frameUrl: string | undefined,
  expectedIndexUrl: string,
  isMainWindowMainFrame: boolean,
): boolean {
  if (!isMainWindowMainFrame || !frameUrl) return false;
  const actual = normalize(frameUrl);
  const expected = normalize(expectedIndexUrl);
  return actual !== null && expected !== null && actual === expected;
}

/** Validates args against a schema; throws a generic error on failure. */
export function validateInput<S extends z.ZodType>(schema: S, args: unknown): z.infer<S> {
  const result = schema.safeParse(args);
  if (!result.success) throw new Error('Invalid IPC input');
  return result.data;
}
