import { protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

export const APP_SCHEME = 'app';
export const APP_HOST = 'renderer';
export const APP_INDEX_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/** Maps an app:// URL to a file inside rootDir, or null if invalid / outside root. */
export function resolveAppPath(rawUrl: string, rootDir: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== `${APP_SCHEME}:` || u.hostname !== APP_HOST) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.includes(':')) return null;
  const root = resolve(rootDir);
  const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  return target.startsWith(root + sep) ? target : null;
}

/** Must be called before app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Call after app is ready. Serves only files inside rootDir. */
export function handleAppProtocol(rootDir: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppPath(request.url, rootDir);
    if (!file) return new Response('Forbidden', { status: 403 });
    try {
      const data = await readFile(file);
      const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
      return new Response(new Uint8Array(data), {
        headers: { 'content-type': type, 'x-content-type-options': 'nosniff' },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
