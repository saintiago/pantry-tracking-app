import React from 'react';
import { t, useLanguage } from '../../i18n/i18n';
import type { PlannableRecipe } from '../../api/meal-plans/meal-plans';
import type { useRecipeDrag } from './useRecipeDrag';

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
  drag,
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
  drag: ReturnType<typeof useRecipeDrag>;
}) {
  useLanguage();
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
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return (
    <>
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
      <p>{t('Open a recipe by name. Drag its handle, or select the handle and tap a meal.')}</p>
      {visible.length === 0 && recipes.length > 0 && <p>{t('No matching recipes')}</p>}
      {visible.map((recipe) => (
        <div
          key={recipe.recipeId}
          style={{
            display: 'flex',
            marginBottom: 6,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
          }}
        >
          <button
            data-recipe-open={recipe.recipeId}
            onClick={() => onOpen(recipe.recipeId)}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              padding: 10,
              border: 0,
              background: 'transparent',
              color: 'var(--color-text)',
              overflowWrap: 'anywhere',
              cursor: 'pointer',
            }}
          >
            {recipe.name}
          </button>
          <button
            type="button"
            aria-label={t('Place {0}', recipe.name)}
            aria-pressed={selected === recipe.recipeId}
            disabled={saving}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onPointerDown={(e) => drag.start(e, recipe.recipeId, recipe.name)}
            onPointerMove={drag.move}
            onPointerUp={drag.end}
            onPointerCancel={drag.cancel}
            onLostPointerCapture={drag.cancel}
            onClick={(e) => {
              if (e.detail > 0 && drag.consumeDragClick()) return;
              onSelect(selected === recipe.recipeId ? '' : recipe.recipeId);
            }}
            style={{
              ...chip(selected === recipe.recipeId),
              minWidth: 44,
              cursor: 'grab',
              touchAction: 'pan-y',
              userSelect: 'none',
            }}
          >
            ⠿
          </button>
        </div>
      ))}
    </>
  );
}

function chip(selected: boolean): React.CSSProperties {
  return {
    minHeight: 36,
    padding: '6px 10px',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    color: 'var(--color-text)',
    background: selected ? 'var(--color-mint)' : 'var(--color-surface)',
    cursor: 'pointer',
  };
}
