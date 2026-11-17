import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import { initialState, reducer, type Action, type AppState } from './reducer';

const StateCtx = createContext<AppState>(initialState);
const DispatchCtx = createContext<Dispatch<Action>>(() => undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const api = window.api;
    const offs = [
      api.on('accounts:changed', (accounts) => dispatch({ type: 'accounts', accounts })),
      api.on('view:state', (info) => dispatch({ type: 'view', info })),
      api.on('view:active', ({ id }) => dispatch({ type: 'active', id })),
    ];
    void Promise.all([api.accounts.list(), api.view.getStates(), api.view.getActive()]).then(
      ([accounts, views, active]) => {
        dispatch({ type: 'init', accounts, views });
        dispatch({ type: 'active', id: active });
      },
    );
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <DispatchCtx.Provider value={dispatch}>
      <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
    </DispatchCtx.Provider>
  );
}

export const useAppState = (): AppState => useContext(StateCtx);
export const useAppDispatch = (): Dispatch<Action> => useContext(DispatchCtx);

export function useSortedAccounts() {
  const { accounts } = useAppState();
  return useMemo(() => [...accounts].sort((a, b) => a.order - b.order), [accounts]);
}
