import DialogShell from '../../components/DialogShell/DialogShell';
import React from 'react';
import type { Arrangement } from './arrangement';
import type { ShoppingState } from './shopping';
import type { ShoppingLine } from './companion';
import { action as button, card as panel, rowWrap as wrap } from './ShoppingRows';
import { t, useLanguage } from '../../i18n/i18n';
export default function ShoppingArrangement({
  arrangement,
  onArrange,
  removeLine,
  onCancel,
  state,
  lines,
  onSave,
  onRemove,
}: {
  arrangement: Arrangement;
  onArrange: (value: Arrangement) => void;
  removeLine: ShoppingLine | null;
  onCancel: () => void;
  state: ShoppingState;
  lines: ShoppingLine[];
  onSave: (state: ShoppingState) => void;
  onRemove: () => void;
}) {
  useLanguage();
  return (
    <>
      <label style={{ ...wrap, marginBottom: 16 }}>
        {t('Arrange by')}{' '}
        <select
          aria-label={t('Arrange shopping list')}
          style={button}
          value={arrangement}
          onChange={(e) => onArrange(e.target.value as Arrangement)}
        >
          <option value="recipe">{t('Recipe')}</option>
          <option value="aisle">{t('Aisle')}</option>
          <option value="az">{t('A to Z')}</option>
          <option value="recent">{t('Recently added')}</option>
        </select>
      </label>
      {removeLine && (
        <DialogShell label={t('Remove shopping item')} onClose={onCancel}>
          <p>
            {t(
              'Remove {0} from this shopping period? Inventory and meal plans will stay unchanged.',
              removeLine.name,
            )}
          </p>
          <button style={button} onClick={onRemove}>
            {t('Remove item')}
          </button>
          <button style={button} onClick={onCancel}>
            {t('Cancel')}
          </button>
        </DialogShell>
      )}
      {!!state.removed?.length && (
        <details style={panel}>
          <summary>
            {t('Removed from this list')} ({state.removed.length})
          </summary>
          {state.removed.map((id) => (
            <p key={id}>
              {lines.find((l) => l.id === id)?.name ?? t('Unavailable item')}{' '}
              <button
                style={button}
                onClick={() =>
                  onSave({ ...state, removed: state.removed?.filter((value) => value !== id) })
                }
              >
                {t('Restore item')}
              </button>
            </p>
          ))}
        </details>
      )}
    </>
  );
}
