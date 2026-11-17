import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { COLOR_NAMES, COLOR_STYLES, errorCode } from '../lib/colors';
import type { Account, AccountColor } from '../state/types';
import { Dialog, btnPrimary, btnSecondary } from './Dialog';

interface Props {
  /** Present when editing; absent for the add wizard. */
  account?: Account;
  onClose: () => void;
}

export function AccountFormDialog({ account, onClose }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(account?.name ?? '');
  const [color, setColor] = useState<AccountColor>(account?.color ?? 'green');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (account) {
        await window.api.accounts.update(account.id, { name: trimmed, color });
      } else {
        const created = await window.api.accounts.create({ name: trimmed, color });
        await window.api.view.activate(created.id);
      }
      onClose();
    } catch (err) {
      setError(errorCode(err) === 'LIMIT_REACHED' ? t('wizard.errorLimit') : t('wizard.errorGeneric'));
      setBusy(false);
    }
  };

  return (
    <Dialog title={account ? t('wizard.editTitle') : t('wizard.title')} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('wizard.name')}
          <input
            data-autofocus
            value={name}
            maxLength={40}
            required
            onChange={(e) => setName(e.target.value)}
            placeholder={t('wizard.namePlaceholder')}
            className="rounded-md border border-neutral-400 bg-white px-2 py-1.5 font-normal text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-neutral-500 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">{t('wizard.color')}</legend>
          <div role="radiogroup" aria-label={t('wizard.color')} className="flex flex-wrap gap-2">
            {COLOR_NAMES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: COLOR_STYLES[c].bg, color: COLOR_STYLES[c].fg }}
                className="flex size-8 items-center justify-center rounded-full text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {color === c ? '✓' : ''}
              </button>
            ))}
          </div>
        </fieldset>
        {!account && (
          <section aria-labelledby="wizard-steps" className="rounded-md bg-neutral-100 p-3 text-sm dark:bg-neutral-900">
            <h3 id="wizard-steps" className="mb-1 font-medium">
              {t('wizard.stepsTitle')}
            </h3>
            <ol className="list-decimal space-y-1 pl-5 text-neutral-700 dark:text-neutral-300">
              <li>{t('wizard.step1')}</li>
              <li>{t('wizard.step2')}</li>
              <li>{t('wizard.step3')}</li>
            </ol>
          </section>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            {t('wizard.cancel')}
          </button>
          <button type="submit" className={btnPrimary} disabled={busy || !name.trim()}>
            {account ? t('wizard.save') : t('wizard.create')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
