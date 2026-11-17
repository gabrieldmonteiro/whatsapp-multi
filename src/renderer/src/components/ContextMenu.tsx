import { useEffect, useRef } from 'react';
import { useViewportOcclusion } from '../state/occlusion';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
}

interface Props {
  label: string;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ label, x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useViewportOcclusion(true);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus();
    return () => prev?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())}>
      <div
        ref={ref}
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - items.length * 36 - 16) }}
        className="absolute w-56 rounded-md border border-neutral-300 bg-white py-1 text-sm text-neutral-900 shadow-lg dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
      >
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={it.checked}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-100 focus-visible:bg-neutral-200 focus-visible:outline-none disabled:opacity-40 dark:hover:bg-neutral-700 dark:focus-visible:bg-neutral-600 ${
              it.danger ? 'text-red-700 dark:text-red-400' : ''
            }`}
          >
            <span aria-hidden="true" className="w-4">
              {it.checked ? '✓' : ''}
            </span>
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
