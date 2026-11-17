import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../state/AppState';
import { useIsOccluded } from '../state/occlusion';
import { btnPrimary } from './Dialog';

/** Empty div whose bounds main uses to place the active WebContentsView. */
export function AccountViewport() {
  const { t } = useTranslation();
  const { activeId, views } = useAppState();
  const occluded = useIsOccluded();
  const ref = useRef<HTMLDivElement>(null);
  const state = activeId ? (views[activeId]?.state ?? 'idle') : null;
  // The native view paints above the DOM, so hide it while a status overlay shows.
  const showOverlay = state !== null && state !== 'ready';
  const hidden = occluded || showOverlay || activeId === null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (hidden) {
      void window.api.view.setBounds(null);
      return;
    }
    let raf = 0;
    const send = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      void window.api.view.setBounds({
        x: Math.max(0, Math.round(r.x)),
        y: Math.max(0, Math.round(r.y)),
        width: Math.max(0, Math.round(r.width)),
        height: Math.max(0, Math.round(r.height)),
      });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(send);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener('resize', schedule);
    send();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [hidden]);

  return (
    <div ref={ref} className="relative flex-1" data-testid="account-viewport">
      {showOverlay && activeId && (
        <div
          role={state === 'error' || state === 'crashed' ? 'alert' : 'status'}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-neutral-700 dark:text-neutral-300"
        >
          <p>{t(`overlay.${state}`)}</p>
          {(state === 'error' || state === 'crashed') && (
            <button type="button" className={btnPrimary} onClick={() => void window.api.view.reload(activeId)}>
              {t('overlay.reload')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
