import { describe, expect, it } from 'vitest';
import { IpcChannel, ipcSchemas, eventSchemas, IpcEvent } from '../shared/ipc';
import { invokeValidated } from './ipc-guard';

const id = '11111111-1111-4111-8111-111111111111';

describe('invokeValidated', () => {
  it('awaits async impl and returns validated response', async () => {
    const r = await invokeValidated(IpcChannel.ViewActivate, [{ id }], async () => undefined);
    expect(r).toBeUndefined();
  });
  it('rejects invalid requests with INVALID and never calls impl', async () => {
    let called = false;
    const impl = (): void => {
      called = true;
    };
    for (const args of [[{ id: 'nope' }], [], [{ id }, 1]]) {
      await expect(invokeValidated(IpcChannel.ViewReload, args, impl)).rejects.toThrow('INVALID');
    }
    expect(called).toBe(false);
  });
  it('rejects unknown patch keys and bad bounds', async () => {
    await expect(
      invokeValidated(IpcChannel.AccountsUpdate, [{ id, patch: { order: 3 } }], () => {
        throw new Error('unreachable');
      }),
    ).rejects.toThrow('INVALID');
    expect(ipcSchemas[IpcChannel.ViewSetBounds].request.safeParse([null]).success).toBe(true);
    expect(
      ipcSchemas[IpcChannel.ViewSetBounds].request.safeParse([{ x: -1, y: 0, width: 1, height: 1 }])
        .success,
    ).toBe(false);
    expect(
      ipcSchemas[IpcChannel.ViewSetBounds].request.safeParse([
        { x: 0, y: 0, width: 99999, height: 1 },
      ]).success,
    ).toBe(false);
  });
  it('rejects invalid responses', async () => {
    await expect(
      invokeValidated(IpcChannel.AppGetVersion, [], (() => 5) as unknown as () => string),
    ).rejects.toThrow('INVALID');
  });
  it('propagates impl error codes', async () => {
    await expect(
      invokeValidated(IpcChannel.ViewReload, [{ id }], () => {
        throw new Error('NOT_FOUND');
      }),
    ).rejects.toThrow('NOT_FOUND');
  });
  it('event schemas validate payloads', () => {
    expect(eventSchemas[IpcEvent.ViewActive].safeParse({ id: null }).success).toBe(true);
    expect(
      eventSchemas[IpcEvent.ViewState].safeParse({ id, state: 'bogus', unread: null }).success,
    ).toBe(false);
  });
});
