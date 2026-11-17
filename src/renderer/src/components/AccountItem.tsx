import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { COLOR_STYLES } from '../lib/colors';
import type { Account, ViewInfo } from '../state/types';

const DOT: Record<ViewInfo['state'], string> = {
  idle: 'bg-neutral-400',
  loading: 'bg-amber-500 animate-pulse',
  ready: 'bg-green-500',
  error: 'bg-red-500',
  crashed: 'bg-red-500',
};

interface Props {
  account: Account;
  view: ViewInfo | undefined;
  active: boolean;
  index: number;
  onSelect: (id: string) => void;
  onMenu: (id: string, x: number, y: number) => void;
  onMove: (id: string, delta: -1 | 1) => void;
}

export const AccountItem = memo(function AccountItem({ account, view, active, index, onSelect, onMenu, onMove }: Props) {
  const { t } = useTranslation();
  const style = COLOR_STYLES[account.color];
  const state = view?.state ?? 'idle';
  const unread = view?.unread ?? 0;
  const label = [
    account.name,
    t(`state.${state}`),
    unread > 0 ? t('sidebar.unread', { count: unread }) : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <li className="relative">
      <button
        type="button"
        aria-label={label}
        aria-current={active ? 'true' : undefined}
        title={index < 9 ? `${account.name} (${t('sidebar.shortcut', { n: index + 1 })})` : account.name}
        onClick={() => onSelect(account.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu(account.id, e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            onMove(account.id, e.key === 'ArrowUp' ? -1 : 1);
          } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(account.id, r.left + 16, r.bottom);
          }
        }}
        className={`flex w-full items-center gap-2 rounded-md py-2 pl-2 pr-9 text-left text-sm focus-visible:outline-2 focus-visible:outline-blue-600 ${
          active ? 'bg-neutral-300 dark:bg-neutral-700' : 'hover:bg-neutral-200 dark:hover:bg-neutral-800'
        }`}
      >
        <span
          aria-hidden="true"
          style={{ backgroundColor: style.bg, color: style.fg }}
          className="relative flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
        >
          {[...account.name][0]?.toUpperCase()}
          <span
            className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-neutral-100 dark:border-neutral-900 ${DOT[state]}`}
          />
        </span>
        <span className="min-w-0 flex-1 truncate">{account.name}</span>
        {unread > 0 && (
          <span aria-hidden="true" className="rounded-full bg-green-700 px-1.5 text-xs font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label={t('sidebar.moreActions', { name: account.name })}
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onMenu(account.id, r.left, r.bottom);
        }}
        className="absolute right-1 top-1/2 size-7 -translate-y-1/2 rounded-md text-neutral-600 hover:bg-neutral-300 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-neutral-300 dark:hover:bg-neutral-600"
      >
        <span aria-hidden="true">{'⋯'}</span>
      </button>
    </li>
  );
});
