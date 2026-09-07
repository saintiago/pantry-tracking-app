import {
  batchBalance,
  dailyCalories,
  entryKcal,
  type PlannerEntry,
  type CookingBatch,
  type PlannerSnapshot,
} from '@pantry/domain';
import { favoriteFromRange, previewCopy } from '../../../domain/recipes/planner-copy';
import { calculateShopping } from '../../ShoppingListPage/shopping';
import { scoreGroceries } from '../GroceryRanking';
import type { ShoppingData } from '../../../api/shopping-list/types';
const meal = (planId: string, date = '2026-09-07'): PlannerEntry => ({
  planId,
  date,
  mealType: 'lunch',
  recipeId: 'rice',
  recipeName: 'Rice',
  servings: 2,
  createdAt: '',
  updatedAt: '',
});
const batch: CookingBatch = {
  batchId: 'batch',
  sourcePlanId: 'source',
  recipeId: 'rice',
  recipeName: 'Rice',
  cookingDate: '2026-09-07',
  plannedYield: 6,
  status: 'planned',
  consumed: 0,
  discarded: 0,
};
const meals = [
  { ...meal('source'), batchId: 'batch' },
  { ...meal('leftovers', '2026-09-08'), batchId: 'batch', entryType: 'leftovers' as const },
];
const recipe = {
  recipeId: 'rice',
  userId: 'owner',
  name: 'Rice',
  tags: [],
  ingredients: [{ name: 'Rice', quantity: 400, unit: 'g' }],
  portions: 4,
  totalKcal: 1600,
  instructions: ['Cook'],
  createdAt: '',
  updatedAt: '',
  syncVersion: 1,
};
const data: ShoppingData = {
  items: [],
  groups: [],
  recipes: [recipe],
  plans: meals,
  batches: [batch],
};
const state: PlannerSnapshot = {
  contractVersion: 2,
  revision: 0,
  mealPlans: meals,
  batches: [batch],
  favorites: [],
};
test('batch portions and calorie totals distinguish yield, reservations, one portion and all portions', () => {
  expect(batchBalance(batch, meals)).toEqual({
    reserved: 4,
    available: 2,
    consumed: 0,
    discarded: 0,
  });
  const kcal = (entry: PlannerEntry) => entryKcal(entry, [batch], [recipe]);
  expect(kcal(meals[0])).toBe(400);
  expect(dailyCalories([meals[0]], kcal)).toEqual({ perPerson: 400, allPortions: 800, missing: 0 });
  const unknown = { ...meal('note'), entryType: 'custom' as const, recipeId: '' };
  expect(dailyCalories([meals[0], unknown], kcal)).toEqual({
    perPerson: 400,
    allPortions: 800,
    missing: 1,
  });
  expect(
    entryKcal(
      meals[0],
      [{ ...batch, status: 'prepared', kcalPerPortion: 350 }],
      [{ ...recipe, totalKcal: 8000 }],
    ),
  ).toBe(350);
  expect(entryKcal(meals[0], [batch], [{ ...recipe, portions: 8 }])).toBe(200);
  expect(entryKcal({ ...unknown, kcalPerPortion: 0 }, [], [])).toBe(0);
});
test('shopping counts six cooked portions once, including a source outside the selected range', () => {
  const result = calculateShopping(data, meals, '2026-09-01');
  expect(result.ingredients[0].needed).toBe(600);
  const crossWeek = calculateShopping(data, [meals[1]], '2026-09-01');
  expect(crossWeek.ingredients[0].needed).toBe(600);
  expect(crossWeek.warnings[0]).toContain('outside this selection');
  expect(
    calculateShopping(
      { ...data, batches: [{ ...batch, status: 'prepared', actualYield: 6 }] },
      meals,
      '2026-09-01',
    ).ingredients,
  ).toEqual([]);
  expect(
    calculateShopping(
      data,
      [{ ...meal('note'), recipeId: '', entryType: 'leftovers-note' }],
      '2026-09-01',
    ).ingredients,
  ).toEqual([]);
});
test('copy creates independent meal/batch IDs and weekday offsets, clearing prepared history', () => {
  const favorite = favoriteFromRange(
    {
      ...state,
      batches: [{ ...batch, status: 'prepared', actualYield: 6, consumed: 2, kcalPerPortion: 400 }],
    },
    '2026-09-07',
    '2026-09-13',
    'Week',
    'favorite',
  );
  let id = 0;
  const preview = previewCopy(favorite, '2026-09-21', [recipe], () => `fresh-${++id}`);
  expect(preview.warnings).toEqual([]);
  expect(preview.entries.map((e) => e.date)).toEqual(['2026-09-21', '2026-09-22']);
  expect(preview.entries[0].planId).not.toBe('source');
  expect(preview.entries[1].batchId).toBe(preview.batches[0].batchId);
  expect(preview.batches[0].sourcePlanId).toBe(preview.entries[0].planId);
  expect(preview.batches[0].status).toBe('planned');
  expect(preview.batches[0].consumed).toBe(0);
  expect(state.mealPlans[0].planId).toBe('source');
});
test('copy flags unavailable recipes and leftovers missing their source', () => {
  const favorite = favoriteFromRange(state, '2026-09-08', '2026-09-08', 'Leftovers only', 'f');
  expect(previewCopy(favorite, '2026-09-21', [], () => 'fresh').warnings).toHaveLength(2);
});
test('grocery ranking handles partial stock, duplicate lines, expiry, units and existing allocations without mutation', () => {
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const stock: ShoppingData = {
    ...data,
    batches: [],
    plans: [{ ...meal('ordinary', day), servings: 2 }],
    items: [
      {
        itemId: 'lot',
        name: 'Rice',
        category: 'Food',
        quantity: 0.3,
        unit: 'kg',
        expirationDate: null,
        location: 'pantry',
        createdAt: '',
        updatedAt: '',
      },
    ],
  };
  const before = JSON.stringify(stock);
  expect(scoreGroceries(stock, [recipe], 2).rice).toMatchObject({
    missing: 1,
    uncertain: false,
    portions: 2,
  });
  expect(scoreGroceries({ ...stock, plans: [] }, [recipe], 2).rice.missing).toBe(0);
  const duplicates = { ...recipe, ingredients: [...recipe.ingredients, ...recipe.ingredients] };
  expect(scoreGroceries({ ...stock, recipes: [duplicates] }, [duplicates], 2).rice.missing).toBe(1);
  const uncertain = { ...recipe, ingredients: [{ name: 'Rice', quantity: null, unit: 'handful' }] };
  expect(scoreGroceries({ ...stock, recipes: [uncertain] }, [uncertain]).rice.uncertain).toBe(true);
  expect(JSON.stringify(stock)).toBe(before);
});
