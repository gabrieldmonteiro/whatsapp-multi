import { useEffect, useState } from 'react';
import { AccountViewport } from './components/AccountViewport';
import { EmptyState } from './components/EmptyState';
import { Sidebar } from './components/Sidebar';
import i18n, { resolveLanguage } from './i18n';
import { AppStateProvider, useAppState } from './state/AppState';
import { OcclusionProvider } from './state/occlusion';

function Shell() {
  const { accounts, activeId, loaded } = useAppState();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void window.api.app.getLocale().then((l) => i18n.changeLanguage(resolveLanguage(l)));
  }, []);

  return (
    <div className="flex h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Sidebar adding={adding} onAddingChange={setAdding} />
      <main className="relative flex min-w-0 flex-1 flex-col">
        {loaded && activeId === null ? (
          <EmptyState hasAccounts={accounts.length > 0} onAdd={() => setAdding(true)} />
        ) : (
          <AccountViewport />
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <OcclusionProvider>
      <AppStateProvider>
        <Shell />
      </AppStateProvider>
    </OcclusionProvider>
  );
}
