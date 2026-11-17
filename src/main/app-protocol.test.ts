import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { resolveAppPath } from './app-protocol';

const root = resolve('/tmp/renderer');

describe('resolveAppPath', () => {
  it('maps root and files inside the root', () => {
    expect(resolveAppPath('app://renderer/', root)).toBe(resolve(root, 'index.html'));
    expect(resolveAppPath('app://renderer/assets/a.js', root)).toBe(resolve(root, 'assets/a.js'));
  });
  it('rejects traversal, wrong host, wrong scheme', () => {
    // URL parsing collapses ../ so it can never escape the root
    expect(resolveAppPath('app://renderer/../secret', root)).toBe(resolve(root, 'secret'));
    expect(resolveAppPath('app://renderer/a%2f..%2f..%2fsecret', root)).toBeNull();
    expect(resolveAppPath('app://renderer/..%5Csecret', root)).toBeNull();
    expect(resolveAppPath('app://other/index.html', root)).toBeNull();
    expect(resolveAppPath('file:///etc/passwd', root)).toBeNull();
  });
});
