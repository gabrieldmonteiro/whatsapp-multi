import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { isTrustedSender, validateInput } from './ipc-guard';
import { IpcChannel, ipcSchemas } from '../shared/ipc';

const dev = 'http://localhost:5173/';
const prod = 'app://renderer/index.html';

describe('isTrustedSender', () => {
  it('accepts exact index URL, ignoring hash and query', () => {
    expect(isTrustedSender('app://renderer/index.html#/x?y=1', prod, true)).toBe(true);
    expect(isTrustedSender('app://renderer/index.html?a=1', prod, true)).toBe(true);
    expect(isTrustedSender('http://localhost:5173/#h', dev, true)).toBe(true);
  });
  it('rejects other pages, origins, schemes, undefined and garbage', () => {
    expect(isTrustedSender('app://renderer/other.html', prod, true)).toBe(false);
    expect(isTrustedSender('app://evil/index.html', prod, true)).toBe(false);
    expect(isTrustedSender('https://web.whatsapp.com/', prod, true)).toBe(false);
    expect(isTrustedSender('http://localhost:5173/x', dev, true)).toBe(false);
    expect(isTrustedSender('http://localhost:5174/', dev, true)).toBe(false);
    expect(isTrustedSender(undefined, prod, true)).toBe(false);
    expect(isTrustedSender('not a url', prod, true)).toBe(false);
  });
  it('rejects when the frame is not the main window main frame', () => {
    expect(isTrustedSender('app://renderer/index.html', prod, false)).toBe(false);
  });
});

describe('validateInput', () => {
  it('accepts empty args for get-version', () => {
    expect(validateInput(ipcSchemas[IpcChannel.AppGetVersion].request, [])).toEqual([]);
  });
  it('rejects unexpected args', () => {
    expect(() => validateInput(ipcSchemas[IpcChannel.AppGetVersion].request, ['x'])).toThrow();
    expect(() => validateInput(z.string(), 1)).toThrow('Invalid IPC input');
  });
});
