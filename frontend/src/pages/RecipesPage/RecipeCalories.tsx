import React, { useState } from 'react';
import { t, useLanguage } from '../../i18n/i18n';
import RecipePhoto from '../../components/RecipePhoto/RecipePhoto';
export function RecipeHeaderMedia({
  recipe,
}: {
  recipe: { totalKcal?: number; portions?: number; imageId?: string };
}) {
  useLanguage();
  return (
    <>
      <p>
        {recipe.totalKcal == null
          ? t('Calories unknown')
          : `${Math.round(recipe.totalKcal / (recipe.portions ?? 1))} ${t('kcal/portion')} · ${Math.round(recipe.totalKcal)} ${t('kcal whole recipe')}`}{' '}
        · {t('User-entered estimate')}
      </p>
      <RecipePhoto imageId={recipe.imageId} alt={t('Recipe image')} />
    </>
  );
}
export default function RecipeCalories({
  total,
  portions,
  onChange,
}: {
  total?: number;
  portions: number;
  onChange: (value: number | undefined) => void;
}) {
  useLanguage();
  const [basis, setBasis] = useState<'total' | 'portion'>('total');
  return (
    <fieldset style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}>
      <legend>{t('Estimated calories (optional)')}</legend>
      <label>
        {t('Calorie input basis')}{' '}
        <select value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)}>
          <option value="total">{t('Whole recipe')}</option>
          <option value="portion">{t('Per portion')}</option>
        </select>
      </label>
      <label style={{ display: 'block', marginTop: 8 }}>
        {t('Calories (kcal)')}{' '}
        <input
          type="number"
          min="0"
          max="100000000"
          step="any"
          value={total === undefined ? '' : basis === 'total' ? total : total / portions}
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? undefined
                : Number(e.target.value) * (basis === 'portion' ? portions : 1),
            )
          }
        />
      </label>
      {total !== undefined && (
        <p>
          {Math.round(total)} {t('kcal whole recipe')} · {Math.round(total / portions)}{' '}
          {t('kcal/portion')}
        </p>
      )}
      <small>
        {t(
          'User-entered estimate. Changing recipe yield keeps total kcal fixed and recalculates kcal per portion. Blank means unknown.',
        )}
      </small>
    </fieldset>
  );
}
