import { z } from 'zod';
import { ipcSchemas } from '../shared/ipc';
import type { IpcChannelName, IpcRequest, IpcResponse } from '../shared/ipc';

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

/**
 * Validates the request tuple, runs the (possibly async) impl, validates the response.
 * Validation failures reject with Error('INVALID'); impl errors pass through unchanged.
 */
export async function invokeValidated<C extends IpcChannelName>(
  channel: C,
  rawArgs: unknown[],
  impl: (...args: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>,
): Promise<IpcResponse<C>> {
  const schemas = ipcSchemas[channel];
  let args: IpcRequest<C>;
  try {
    args = validateInput(schemas.request, rawArgs) as IpcRequest<C>;
  } catch {
    throw new Error('INVALID');
  }
  const result = await impl(...args);
  const out = schemas.response.safeParse(result);
  if (!out.success) throw new Error('INVALID');
  return out.data as IpcResponse<C>;
}
