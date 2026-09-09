import React from 'react';
import Emoji from '../../preferences/Emoji';
import LibraryCover from './LibraryCover';
import { computeTotalTime, type Recipe } from '../../api/recipes/recipes';
import { recipeExpiration } from '../../domain/recipes/expiration';
import type { InventoryItem } from '../../domain/inventory/types';
import { t, useLanguage } from '../../i18n/i18n';
export type LibraryView = 'list' | 'icons' | 'images';
export function RecipeViewPicker({
  value,
  onChange,
}: {
  value: LibraryView;
  onChange: (value: LibraryView) => void;
}) {
  useLanguage();
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: '12px 0',
        fontSize: '.875rem',
      }}
    >
      {t('Recipe view')}
      <select
        aria-label={t('Recipe view')}
        value={value}
        onChange={(e) => onChange(e.target.value as LibraryView)}
        style={{ minHeight: 44, maxWidth: '100%' }}
      >
        <option value="list">{t('List')}</option>
        <option value="icons">{t('Icons')}</option>
        <option value="images">{t('Larger images')}</option>
      </select>
    </label>
  );
}
export default function RecipeCards({
  recipes,
  view,
  onSelect,
  cookingId,
  inventoryItems,
  today,
  expiringWithinDays,
}: {
  recipes: Recipe[];
  view: LibraryView;
  onSelect: (id: string) => void;
  cookingId?: string;
  inventoryItems: InventoryItem[];
  today: string;
  expiringWithinDays?: number;
}) {
  useLanguage();
  return (
    <ul className="library-grid" data-view={view}>
      {recipes.map((recipe) => {
        const total = computeTotalTime(recipe.prepTime, recipe.cookTime);
        const missing = (recipe as Recipe & { missingCount?: number }).missingCount;
        return (
          <li key={recipe.recipeId} className="library-recipe">
            <button
              type="button"
              aria-label={t('View {0}', recipe.name)}
              onClick={() => onSelect(recipe.recipeId)}
            >
              <LibraryCover imageId={recipe.imageId} name={recipe.name} />
              <span className="library-recipe-info">
                <strong>
                  {recipe.name}
                  {cookingId === recipe.recipeId && (
                    <span aria-label={t('Currently cooking')}>
                      <Emoji> 🍳</Emoji>
                    </span>
                  )}
                </strong>
                {!!expiringWithinDays && (
                  <span>
                    {t(
                      'Use soon: {0}',
                      recipeExpiration(recipe, inventoryItems, today, expiringWithinDays)
                        .map((item) => item.name + ' (' + item.expiration + ')')
                        .join(', '),
                    )}
                  </span>
                )}
                <span className="library-recipe-meta">
                  {(recipe.tags ?? []).map((tag) => (
                    <span key={tag} className="library-recipe-tag">
                      {tag}
                    </span>
                  ))}
                  {total !== undefined && (
                    <span aria-label={t('{0} minutes total', total)}>
                      {total} {t('min')}
                    </span>
                  )}
                  {missing != null && missing > 0 && (
                    <span aria-label={t('{0} ingredient(s) missing', missing)}>
                      {missing} {t('missing')}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
