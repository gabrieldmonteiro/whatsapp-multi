import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface Ctx {
  count: number;
  acquire: () => () => void;
}
const OcclusionCtx = createContext<Ctx>({ count: 0, acquire: () => () => undefined });

export function OcclusionProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const acquire = useCallback(() => {
    setCount((c) => c + 1);
    return () => setCount((c) => c - 1);
  }, []);
  const value = useMemo(() => ({ count, acquire }), [count, acquire]);
  return <OcclusionCtx.Provider value={value}>{children}</OcclusionCtx.Provider>;
}

/** While `active`, the account view is hidden (setBounds(null)) so the overlay is visible. */
export function useViewportOcclusion(active = true): void {
  const { acquire } = useContext(OcclusionCtx);
  useEffect(() => (active ? acquire() : undefined), [active, acquire]);
}

export const useIsOccluded = (): boolean => useContext(OcclusionCtx).count > 0;
