import type { Account, ViewInfo } from './types';

export interface AppState {
  loaded: boolean;
  accounts: Account[];
  views: Record<string, ViewInfo>;
  activeId: string | null;
}

export type Action =
  | { type: 'init'; accounts: Account[]; views: ViewInfo[] }
  | { type: 'accounts'; accounts: Account[] }
  | { type: 'view'; info: ViewInfo }
  | { type: 'active'; id: string | null };

export const initialState: AppState = { loaded: false, accounts: [], views: {}, activeId: null };

function prune(views: Record<string, ViewInfo>, accounts: Account[]): Record<string, ViewInfo> {
  const ids = new Set(accounts.map((a) => a.id));
  const keys = Object.keys(views);
  if (keys.every((k) => ids.has(k))) return views;
  return Object.fromEntries(keys.filter((k) => ids.has(k)).map((k) => [k, views[k] as ViewInfo]));
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'init': {
      const views = { ...state.views };
      for (const v of action.views) views[v.id] ??= v;
      return { ...state, loaded: true, accounts: action.accounts, views: prune(views, action.accounts) };
    }
    case 'accounts': {
      const activeId =
        state.activeId && action.accounts.some((a) => a.id === state.activeId) ? state.activeId : null;
      return { ...state, loaded: true, accounts: action.accounts, views: prune(state.views, action.accounts), activeId };
    }
    case 'view':
      return { ...state, views: { ...state.views, [action.info.id]: action.info } };
    case 'active':
      return state.activeId === action.id ? state : { ...state, activeId: action.id };
  }
}
