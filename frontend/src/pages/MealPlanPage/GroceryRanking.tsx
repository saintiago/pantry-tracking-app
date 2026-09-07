import React, { useEffect, useState } from 'react';
import type { CookingBatch } from '@pantry/domain';
import type { MealPlan, PlannableRecipe } from '../../api/meal-plans/meal-plans';
import { fetchInventory } from '../../api/inventory/inventory';
import type { ShoppingData } from '../../api/shopping-list/types';
import { baseUnit, calculateShopping, localToday } from '../ShoppingListPage/shopping';
import { t, message, useLanguage } from '../../i18n/i18n';
export interface GroceryScore {
  missing: number;
  uncertain: boolean;
  details: string[];
  portions: number;
}
export function scoreGroceries(
  data: ShoppingData,
  recipes: PlannableRecipe[],
  portions?: number,
): Record<string, GroceryScore> {
  const today = localToday();
  const allocated = calculateShopping(
    data,
    data.plans.filter((p) => p.date >= today),
    today,
  );
  const remaining = {
    ...data,
    items: data.items.map((i) => ({
      ...i,
      quantity: (allocated.remaining.get(i.itemId) ?? 0) / baseUnit(i.unit).factor,
    })),
  };
  return Object.fromEntries(
    recipes.map((recipe) => {
      const count = portions ?? recipe.portions ?? 1;
      const candidate = {
        planId: 'candidate',
        recipeId: recipe.recipeId,
        recipeName: recipe.name,
        date: today,
        mealType: 'dinner' as const,
        servings: count,
        createdAt: '',
        updatedAt: '',
      };
      const calculation = calculateShopping(remaining, [candidate], today);
      return [
        recipe.recipeId,
        {
          portions: count,
          missing: calculation.ingredients.filter((i) => i.buy > 0).length,
          uncertain:
            !recipe.ingredients?.length ||
            allocated.warnings.length > 0 ||
            allocated.ingredients.some(
              (i) => i.unknown || i.warnings.includes('Check inventory match'),
            ) ||
            calculation.warnings.length > 0 ||
            calculation.ingredients.some(
              (i) => i.unknown || i.warnings.includes('Check inventory match'),
            ),
          details: calculation.ingredients
            .filter((i) => i.buy > 0 || i.unknown || i.warnings.includes('Check inventory match'))
            .map(
              (i) => `${i.name}: ${i.unknown ? '?' : Math.round(i.buy * 1000) / 1000} ${i.unit}`,
            ),
        },
      ];
    }),
  );
}
export default function GroceryRanking({
  recipes,
  plans,
  batches,
  onScores,
}: {
  recipes: PlannableRecipe[];
  plans: MealPlan[];
  batches: CookingBatch[];
  onScores: (scores: Record<string, GroceryScore>) => void;
}) {
  useLanguage();
  const [stock, setStock] = useState<Awaited<ReturnType<typeof fetchInventory>> | null>(null);
  const [error, setError] = useState('');
  const [portions, setPortions] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setStock(null);
    void fetchInventory(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setStock(value);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : 'Could not load inventory');
      });
    return () => controller.abort();
  }, [refresh, plans]);
  useEffect(() => {
    onScores(
      stock
        ? scoreGroceries(
            {
              items: stock.items,
              groups: stock.groups ?? [],
              recipes: recipes as ShoppingData['recipes'],
              plans,
              batches,
            },
            recipes,
            portions && Number(portions) > 0 ? Number(portions) : undefined,
          )
        : {},
    );
  }, [stock, recipes, plans, batches, portions]);
  return (
    <div>
      <label>
        {t('Ranking portions (blank uses recipe yield)')}
        <input
          type="number"
          min="0.01"
          step="any"
          value={portions}
          onChange={(e) => setPortions(e.target.value)}
          style={{ width: 75 }}
        />
      </label>
      <small>
        {t(
          'Counts distinct missing ingredients, not price. Current planned cooking reserves stock first.',
        )}
      </small>
      {!stock && !error && <p role="status">{t('Checking groceries…')}</p>}
      {error && <p role="alert">{message(error)}</p>}
      <button type="button" onClick={() => setRefresh((n) => n + 1)}>
        {t('Refresh inventory')}
      </button>
    </div>
  );
}
