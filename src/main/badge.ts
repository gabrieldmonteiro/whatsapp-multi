import { app, nativeImage } from 'electron';
import type { BrowserWindow, NativeImage } from 'electron';

let dot: NativeImage | null = null;

/** 16x16 red dot, drawn from raw BGRA pixels (no asset files). */
function redDot(): NativeImage {
  if (dot) return dot;
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x - c) ** 2 + (y - c) ** 2 <= 7.5 ** 2) {
        const o = (y * size + x) * 4;
        buf[o] = 0x30; // B
        buf[o + 1] = 0x30; // G
        buf[o + 2] = 0xe0; // R
        buf[o + 3] = 0xff; // A
      }
    }
  }
  dot = nativeImage.createFromBitmap(buf, { width: size, height: size });
  return dot;
}

/** App badge count plus Windows taskbar overlay. */
export function updateBadge(total: number, win: BrowserWindow | null): void {
  app.setBadgeCount(total);
  if (process.platform === 'win32' && win && !win.isDestroyed()) {
    win.setOverlayIcon(total > 0 ? redDot() : null, total > 0 ? `${total} unread` : '');
  }
}
