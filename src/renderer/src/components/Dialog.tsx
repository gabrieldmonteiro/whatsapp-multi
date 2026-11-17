import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useViewportOcclusion } from '../state/occlusion';

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),[href],[tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useViewportOcclusion(true);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    (el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    return () => prev?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab' && ref.current) {
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-lg bg-white p-5 text-neutral-900 shadow-xl dark:bg-neutral-800 dark:text-neutral-100"
      >
        <h2 id={titleId} className="mb-3 text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export const btn =
  'rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50';
export const btnPrimary = `${btn} bg-blue-700 text-white hover:bg-blue-800`;
export const btnSecondary = `${btn} bg-neutral-200 text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600`;
export const btnDanger = `${btn} bg-red-700 text-white hover:bg-red-800`;
