import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { resolveLanguage } from './i18n';

export function App() {
  const { t } = useTranslation();
  const [version, setVersion] = useState('');

  useEffect(() => {
    void window.api.app.getLocale().then((l) => i18n.changeLanguage(resolveLanguage(l)));
    void window.api.app.getVersion().then(setVersion);
  }, []);

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-2 bg-neutral-900 text-neutral-100">
      <h1 className="text-2xl font-semibold">{t('shell.title')}</h1>
      <p className="text-sm text-neutral-400">{t('shell.placeholder')}</p>
      {version && <p className="text-xs text-neutral-500">{t('shell.version', { version })}</p>}
    </main>
  );
}
