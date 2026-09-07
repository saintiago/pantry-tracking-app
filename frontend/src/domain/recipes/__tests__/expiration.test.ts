import { recipeExpiration, prioritizeExpiringRecipes } from '../expiration';
import type { Recipe } from '../types';
import type { InventoryItem } from '../../inventory/types';
const recipe = (
  name = 'Milk soup',
  ingredients = [{ name: 'Milk', quantity: 1, unit: 'l' }],
): Recipe => ({
  recipeId: name,
  name,
  ingredients,
  userId: 'u',
  tags: [],
  instructions: ['Cook'],
  createdAt: '',
  updatedAt: '',
  syncVersion: 1,
});
const lot = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  itemId: 'milk',
  name: 'Milk',
  category: 'Dairy',
  expirationDate: '2026-09-08',
  location: 'fridge',
  quantity: 1,
  unit: 'l',
  createdAt: '',
  updatedAt: '',
  ...overrides,
});
const today = '2026-09-07';
test('includes today and the selected boundary, distinguishing one and two weeks', () => {
  for (const expirationDate of [today, '2026-09-14'])
    expect(recipeExpiration(recipe(), [lot({ expirationDate })], today, 7)).toHaveLength(1);
  expect(recipeExpiration(recipe(), [lot({ expirationDate: '2026-09-15' })], today, 7)).toEqual([]);
  expect(
    recipeExpiration(recipe(), [lot({ expirationDate: '2026-09-21' })], today, 14),
  ).toHaveLength(1);
  expect(recipeExpiration(recipe(), [lot({ expirationDate: '2026-09-22' })], today, 14)).toEqual(
    [],
  );
});
test.each([
  { quantity: 0 },
  { quantity: -1 },
  { quantity: NaN },
  { expirationDate: '2026-09-06' },
  { expirationDate: '' },
  { expirationDate: '2026-09-31' },
  { expirationDate: '2026-13-01' },
  { unit: 'g' },
  { name: 'Eggs' },
])('ignores unusable stock %j', (overrides) => {
  expect(recipeExpiration(recipe(), [lot(overrides)], today, 30)).toEqual([]);
});
test('matches normalized names and compatible dimensions across lots, choosing earliest', () => {
  const result = recipeExpiration(
    recipe(),
    [
      lot({ expirationDate: '2026-09-12' }),
      lot({ itemId: 'second', name: '  MILK ', unit: 'ml', expirationDate: '2026-09-09' }),
    ],
    today,
    7,
  );
  expect(result).toEqual([{ name: 'Milk', expiration: '2026-09-09' }]);
});
test('linked ingredients use their group instead of other products with the same name', () => {
  const linked: Recipe = {
    ...recipe(),
    ingredients: [{ name: 'Milk', quantity: 1, unit: 'l', inventoryItemId: 'linked' }],
  };
  const items = [
    lot({ itemId: 'linked', groupId: 'g1', quantity: 0 }),
    lot({ itemId: 'other', groupId: 'g2' }),
    lot({ itemId: 'same-group', groupId: 'g1', expirationDate: '2026-09-10' }),
  ];
  expect(recipeExpiration(linked, items, today, 7)).toEqual([
    { name: 'Milk', expiration: '2026-09-10' },
  ]);
});
test('prioritizes earliest expiry and filters out unmatched recipes without mutating input', () => {
  const later = recipe('Milk soup');
  const earlier = recipe('Egg dish', [{ name: 'Egg', quantity: 1, unit: 'piece' }]);
  const absent = recipe('Rice', [{ name: 'Rice', quantity: 1, unit: 'g' }]);
  const recipes = [later, absent, earlier];
  const items = [
    lot({ expirationDate: '2026-09-13' }),
    lot({ name: 'Egg', unit: 'piece', expirationDate: '2026-09-08' }),
  ];
  expect(prioritizeExpiringRecipes(recipes, items, today, 7)).toEqual([earlier, later]);
  expect(prioritizeExpiringRecipes(recipes, items, today, 0)).toBe(recipes);
  expect(recipes).toEqual([later, absent, earlier]);
});
