import { rowStyle, nameStyle, chip } from './recipeLibraryStyles';
import React, { useState } from 'react';
import GroceryRanking, { type GroceryScore } from './GroceryRanking';
import type { CookingBatch, PlannerEntry } from '@pantry/domain';
import { t, useLanguage } from '../../i18n/i18n';
import type { PlannableRecipe } from '../../api/meal-plans/meal-plans';

export default function RecipeLibrary({
  recipes,
  search,
  onSearch,
  categories,
  onCategories,
  selected,
  onSelect,
  onOpen,
  saving,
  plans = [],
  batches = [],
}: {
  recipes: PlannableRecipe[];
  search: string;
  onSearch: (value: string) => void;
  categories: string[];
  onCategories: (value: string[]) => void;
  selected: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  saving: boolean;
  plans?: PlannerEntry[];
  batches?: CookingBatch[];
}) {
  useLanguage();
  const [sort, setSort] = useState('alphabetical');
  const [scores, setScores] = useState<Record<string, GroceryScore>>({});
  const tags = Array.from(
    new Set(recipes.flatMap((r) => (r.tags?.length ? r.tags : ['Uncategorized']))),
  ).sort();
  const visible = recipes
    .filter(
      (r) =>
        r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
        (!categories.length ||
          (r.tags?.length ? r.tags : ['Uncategorized']).some((tag) => categories.includes(tag))),
    )
    .sort((a, b) => {
      if (sort === 'groceries') {
        const score = (id: string) =>
          !scores[id] || scores[id].uncertain ? Infinity : scores[id].missing;
        const difference = score(a.recipeId) - score(b.recipeId);
        if (difference && !Number.isNaN(difference)) return difference;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  return (
    <>
      <label>
        {t('Sort recipes')}
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="alphabetical">{t('Alphabetical')}</option>
          <option value="groceries">{t('Fewest additional groceries')}</option>
        </select>
      </label>
      {sort === 'groceries' && (
        <GroceryRanking recipes={recipes} plans={plans} batches={batches} onScores={setScores} />
      )}
      <label>
        {t('Search recipes')}
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
        />
      </label>
      <div
        aria-label={t('Recipe categories')}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}
      >
        <button
          aria-pressed={!categories.length}
          onClick={() => onCategories([])}
          style={chip(!categories.length)}
        >
          {t('All')}
        </button>
        {tags.map((tag) => (
          <button
            key={tag}
            aria-pressed={categories.includes(tag)}
            onClick={() =>
              onCategories(
                categories.includes(tag)
                  ? categories.filter((c) => c !== tag)
                  : [...categories, tag],
              )
            }
            style={chip(categories.includes(tag))}
          >
            {tag === 'Uncategorized' ? t(tag) : tag}
          </button>
        ))}
      </div>
      <p>
        {t('Click a recipe to open it. Drag a card to plan it; on touch, hold before dragging.')}
      </p>
      {visible.length === 0 && recipes.length > 0 && <p>{t('No matching recipes')}</p>}
      {recipes.length === 0 && <p>{t('No recipes yet. Add recipes in the Recipes tab.')}</p>}
      {visible.map((recipe) => (
        <div
          key={recipe.recipeId}
          data-recipe-row
          data-drag-id={recipe.recipeId}
          data-drag-name={recipe.name}
          aria-disabled={saving}
          style={{ ...rowStyle, flexDirection: 'column' }}
        >
          <button
            data-recipe-open={recipe.recipeId}
            data-drag-id={recipe.recipeId}
            data-drag-name={recipe.name}
            disabled={saving}
            onClick={() => onOpen(recipe.recipeId)}
            style={nameStyle}
          >
            {recipe.name}
          </button>
          {sort === 'groceries' && (
            <details data-no-drag style={{ padding: '0 10px 8px' }}>
              <summary>
                {!scores[recipe.recipeId] || scores[recipe.recipeId].uncertain
                  ? t('Needs checking')
                  : scores[recipe.recipeId].missing === 0
                    ? t('Uses what you have')
                    : t('{0} ingredients to buy', scores[recipe.recipeId].missing)}
              </summary>
              <small>
                {t('For {0} portions', scores[recipe.recipeId]?.portions ?? recipe.portions ?? 1)}
              </small>
              <ul>
                {scores[recipe.recipeId]?.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </details>
          )}
          <button
            type="button"
            aria-label={t('Place {0}', recipe.name)}
            aria-pressed={selected === recipe.recipeId}
            disabled={saving}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            data-no-drag
            onClick={() => onSelect(selected === recipe.recipeId ? '' : recipe.recipeId)}
            style={{
              ...chip(selected === recipe.recipeId),
              minWidth: 44,
              cursor: 'grab',
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            {t('Plan')}
          </button>
        </div>
      ))}
    </>
  );
}
