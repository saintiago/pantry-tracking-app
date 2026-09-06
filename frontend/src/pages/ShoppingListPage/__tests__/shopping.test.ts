import { calculateShopping, needsReview, baseUnit, readState, storageKey } from '../shopping';
import type { ShoppingData } from '../shopping';
import type { Recipe } from '../../../api/recipes/recipes';
import type { InventoryItem, InventoryGroup } from '../../../api/inventory/inventory';
import type { MealPlan } from '../../../api/meal-plans/meal-plans';
const group = {
  groupId: 'rice',
  name: 'Rice',
  unit: 'kg',
  category: 'Food',
  isLowStock: true,
  threshold: 1,
  totalQuantity: 0.3,
} as InventoryGroup;
const lot = {
  itemId: 'a',
  groupId: 'rice',
  name: 'Rice',
  unit: 'kg',
  quantity: 0.3,
  expirationDate: '2026-09-20',
} as InventoryItem;
const recipe = {
  recipeId: 'curry',
  name: 'Curry',
  portions: 4,
  ingredients: [{ name: 'rice', quantity: 400, unit: 'g' }],
} as Recipe;
const plan = {
  planId: '1',
  date: '2026-09-07',
  recipeId: 'curry',
  mealType: 'lunch',
  servings: 2,
} as MealPlan;
const data = (): ShoppingData => ({
  groups: [group],
  items: [lot],
  recipes: [recipe],
  plans: [plan],
});
const calculate = (d: ShoppingData) => calculateShopping(d, d.plans, '2026-09-07');

test('scales every meal and deducts inventory once across repeated recipes and units', () => {
  const d = data();
  d.plans.push({ ...plan, planId: '2', date: '2026-09-08', servings: 4 });
  const result = calculate(d);
  expect(result.ingredients).toHaveLength(1);
  expect(result.ingredients[0]).toMatchObject({ needed: 600, available: 300, buy: 300, unit: 'g' });
  expect(result.ingredients[0].contributions).toHaveLength(2);
  expect(result.lowStock[0].id).toBe(result.ingredients[0].id);
});
test('allocates earliest-expiring lots in date order and excludes expired/too-early stock', () => {
  const d = data();
  d.items = [
    { ...lot, itemId: 'expired', quantity: 1, expirationDate: '2026-09-06' },
    { ...lot, itemId: 'soon', quantity: 0.2, expirationDate: '2026-09-07' },
    { ...lot, itemId: 'later', quantity: 0.1, expirationDate: '2026-09-09' },
  ];
  d.plans = [{ ...plan, planId: 'later', date: '2026-09-08' }, plan];
  expect(calculate(d).ingredients[0]).toMatchObject({
    needed: 400,
    available: 300,
    buy: 100,
    warnings: ['Expired stock excluded', 'Stock expires before a planned meal'],
  });
});
test('filtering recomputes quantities and leaves all low-stock groups', () => {
  const d = data();
  expect(calculateShopping(d, [], '2026-09-07')).toMatchObject({
    ingredients: [],
    lowStock: [{ id: 'group:rice' }],
  });
  expect(calculate(d).ingredients[0].buy).toBe(0);
});
test('ambiguous groups and incompatible units do not silently consume stock', () => {
  const d = data();
  d.groups.push({ ...group, groupId: 'other', category: 'Pet food' });
  expect(calculate(d).ingredients[0]).toMatchObject({
    buy: 200,
    warnings: ['Check inventory match'],
  });
  d.groups = [];
  d.items = [{ ...lot, unit: 'can' }];
  expect(calculate(d).ingredients[0]).toMatchObject({
    buy: 200,
    warnings: ['Check inventory match'],
  });
});
test('explicit links resolve ambiguity and stale links require review', () => {
  const d = data();
  d.groups.push({ ...group, groupId: 'other' });
  d.recipes = [{ ...recipe, ingredients: [{ ...recipe.ingredients[0], inventoryItemId: 'a' }] }];
  expect(calculate(d).ingredients[0]).toMatchObject({ id: 'group:rice', buy: 0 });
  d.items = [];
  expect(calculate(d).ingredients[0]).toMatchObject({
    buy: 200,
    warnings: ['Check inventory match'],
  });
});
test('unknown quantities and missing recipes stay explicit', () => {
  const d = data();
  d.recipes = [{ ...recipe, ingredients: [{ name: 'Basil', unit: 'handful', quantity: null }] }];
  expect(calculate(d).ingredients[0].unknown).toBe(true);
  d.recipes = [];
  expect(calculate(d).warnings[0]).toContain('Recipe unavailable');
});
test('aliases with explicit links cannot allocate the same lot twice', () => {
  const d = data();
  d.recipes = [
    {
      ...recipe,
      ingredients: [
        { name: 'Rice', quantity: 400, unit: 'g', inventoryItemId: 'a' },
        { name: 'White rice', quantity: 0.4, unit: 'kg', inventoryItemId: 'a' },
      ],
    },
  ];
  expect(calculate(d).ingredients[0]).toMatchObject({ needed: 400, buy: 100 });
});
test('basket review detects increased quantities, new assignments and unknown quantities', () => {
  const row = calculate(data()).ingredients[0];
  const entry = { quantity: 20, plans: ['1'], unknown: false };
  expect(needsReview(entry, 10, row)).toBe(false);
  expect(needsReview(entry, 21, row)).toBe(true);
  expect(needsReview(entry, 10, { ...row, unknown: true })).toBe(true);
  expect(needsReview({ ...entry, plans: [] }, 10, row)).toBe(true);
});
test('storage is isolated by user and period; corrupt saved state is rejected', () => {
  expect(storageKey('a', 'start', 'end')).not.toBe(storageKey('b', 'start', 'end'));
  expect(storageKey('a', 'start', 'end')).not.toBe(storageKey('a', 'next', 'end'));
  localStorage.setItem('bad', '{"checked":{"x":{}},"extras":{}}');
  expect(() => readState('bad')).toThrow();
  expect(readState('absent')).toEqual({ checked: {}, extras: {} });
  expect(baseUnit('Kilo')).toEqual({ unit: 'g', factor: 1000 });
  expect(baseUnit('can')).toEqual({ unit: 'can', factor: 1 });
});
