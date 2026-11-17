import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState, useSortedAccounts } from '../state/AppState';
import { AccountFormDialog } from './AccountFormDialog';
import { AccountItem } from './AccountItem';
import { ConfirmDialog } from './ConfirmDialog';
import { ContextMenu, type MenuItem } from './ContextMenu';

interface Props {
  adding: boolean;
  onAddingChange: (v: boolean) => void;
}

export function Sidebar({ adding, onAddingChange }: Props) {
  const { t } = useTranslation();
  const { activeId, views } = useAppState();
  const accounts = useSortedAccounts();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const select = useCallback((id: string) => void window.api.view.activate(id), []);
  const openMenu = useCallback((id: string, x: number, y: number) => setMenu({ id, x, y }), []);
  const move = useCallback(
    (id: string, delta: -1 | 1) => {
      const ids = accounts.map((a) => a.id);
      const i = ids.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
      void window.api.accounts.reorder(ids);
    },
    [accounts],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || !/^[1-9]$/.test(e.key)) return;
      const acc = accounts[Number(e.key) - 1];
      if (acc) {
        e.preventDefault();
        select(acc.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accounts, select]);

  const menuAcc = menu ? accounts.find((a) => a.id === menu.id) : undefined;
  const idx = menuAcc ? accounts.indexOf(menuAcc) : -1;
  const items: MenuItem[] = menuAcc
    ? [
        { key: 'rename', label: t('menu.rename'), onSelect: () => setEditId(menuAcc.id) },
        { key: 'color', label: t('menu.color'), onSelect: () => setEditId(menuAcc.id) },
        {
          key: 'keepAlive',
          label: t('menu.keepAlive'),
          checked: menuAcc.keepAlive,
          onSelect: () => void window.api.accounts.update(menuAcc.id, { keepAlive: !menuAcc.keepAlive }),
        },
        {
          key: 'notifications',
          label: t('menu.notifications'),
          checked: menuAcc.notifications,
          onSelect: () => void window.api.accounts.update(menuAcc.id, { notifications: !menuAcc.notifications }),
        },
        { key: 'up', label: t('menu.moveUp'), disabled: idx <= 0, onSelect: () => move(menuAcc.id, -1) },
        {
          key: 'down',
          label: t('menu.moveDown'),
          disabled: idx >= accounts.length - 1,
          onSelect: () => move(menuAcc.id, 1),
        },
        { key: 'remove', label: t('menu.remove'), danger: true, onSelect: () => setRemoveId(menuAcc.id) },
      ]
    : [];
  const editAcc = accounts.find((a) => a.id === editId);
  const removeAcc = accounts.find((a) => a.id === removeId);

  return (
    <nav
      aria-label={t('sidebar.label')}
      className="flex w-60 shrink-0 flex-col border-r border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {accounts.map((a, i) => (
          <AccountItem
            key={a.id}
            account={a}
            view={views[a.id]}
            active={a.id === activeId}
            index={i}
            onSelect={select}
            onMenu={openMenu}
            onMove={move}
          />
        ))}
      </ul>
      <div className="space-y-2 border-t border-neutral-300 p-2 dark:border-neutral-700">
        <button
          type="button"
          onClick={() => onAddingChange(true)}
          className="w-full rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          + {t('sidebar.add')}
        </button>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">{t('sidebar.unofficial')}</p>
      </div>
      {menu && menuAcc && (
        <ContextMenu label={menuAcc.name} x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />
      )}
      {adding && <AccountFormDialog onClose={() => onAddingChange(false)} />}
      {editAcc && <AccountFormDialog account={editAcc} onClose={() => setEditId(null)} />}
      {removeAcc && (
        <ConfirmDialog
          name={removeAcc.name}
          onCancel={() => setRemoveId(null)}
          onConfirm={() => {
            setRemoveId(null);
            void window.api.accounts.remove(removeAcc.id);
          }}
        />
      )}
    </nav>
  );
}
