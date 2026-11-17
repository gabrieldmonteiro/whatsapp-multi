import { useTranslation } from 'react-i18next';
import { Dialog, btnDanger, btnSecondary } from './Dialog';

export function ConfirmDialog({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog title={t('confirm.removeTitle')} onClose={onCancel}>
      <p className="mb-4 text-sm text-neutral-700 dark:text-neutral-300">{t('confirm.removeBody', { name })}</p>
      <div className="flex justify-end gap-2">
        <button type="button" data-autofocus className={btnSecondary} onClick={onCancel}>
          {t('confirm.cancel')}
        </button>
        <button type="button" className={btnDanger} onClick={onConfirm}>
          {t('confirm.remove')}
        </button>
      </div>
    </Dialog>
  );
}
