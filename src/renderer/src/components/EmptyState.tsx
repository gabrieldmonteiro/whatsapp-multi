import { useTranslation } from 'react-i18next';
import { btnPrimary } from './Dialog';

export function EmptyState({ hasAccounts, onAdd }: { hasAccounts: boolean; onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-xl font-semibold">{hasAccounts ? t('empty.select') : t('empty.title')}</h2>
      {!hasAccounts && (
        <>
          <p className="max-w-sm text-sm text-neutral-600 dark:text-neutral-400">{t('empty.body')}</p>
          <button type="button" className={btnPrimary} onClick={onAdd}>
            {t('empty.cta')}
          </button>
        </>
      )}
    </div>
  );
}
