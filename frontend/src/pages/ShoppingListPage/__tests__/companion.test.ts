import {
  buildLines,
  emptyCompanion,
  packageSuggestion,
  completePurchase,
  safeProductLink,
  isDeferred,
  shoppingInventory,
  purchaseCadence,
  readCompanion,
} from '../companion';
import { calculateShopping } from '../shopping';
import type { ShoppingData } from '../shopping';
import { departmentFor } from '../departments';
import type { AddItemData } from '../../AddItemPage/AddItemPage';
const data = {
  items: [
    {
      itemId: 'h',
      groupId: 'honey',
      name: 'Honey',
      quantity: 1,
      unit: 'bottle',
      expirationDate: '2028-01-01',
    },
  ],
  groups: [
    {
      groupId: 'honey',
      name: 'Honey',
      category: 'Pantry',
      unit: 'bottle',
      totalQuantity: 1,
      threshold: 2,
      isLowStock: true,
    },
  ],
  recipes: [
    {
      recipeId: 'r',
      name: 'Cake',
      portions: 1,
      ingredients: [{ name: 'Honey', unit: 'bottle', quantity: 1 }],
    },
  ],
  plans: [{ planId: 'p', recipeId: 'r', date: '2026-09-07', mealType: 'lunch', servings: 1 }],
} as unknown as ShoppingData;
const today = '2026-09-07';
it('completes the threshold and preserves it after meals without counting stock twice', () => {
  expect(
    buildLines(data, calculateShopping(data, [], today), emptyCompanion(), today)[0],
  ).toMatchObject({ quantity: 1, reserve: 2 });
  expect(
    buildLines(data, calculateShopping(data, data.plans, today), emptyCompanion(), today)[0],
  ).toMatchObject({ quantity: 2, reserve: 2, extra: 2 });
});
it('uses remaining lots accurately when early-expiring inventory supplies an earlier meal', () => {
  const d = {
    ...data,
    items: [
      { ...data.items[0], quantity: 1, expirationDate: today },
      { ...data.items[0], itemId: 'later', quantity: 2 },
    ],
    plans: [...data.plans, { ...data.plans[0], planId: 'p2', date: '2026-09-08' }],
  };
  expect(
    buildLines(d, calculateShopping(d, d.plans, today), emptyCompanion(), today)[0].quantity,
  ).toBe(1);
});
it('merges compatible manual additions with generated items and retains source labels', () => {
  const state = emptyCompanion();
  state.manual.push({
    id: 'm',
    name: 'honey',
    quantity: 1,
    unit: 'bottle',
    category: 'Pantry',
    store: 'Carrefour',
    notes: '',
  });
  const result = buildLines(data, calculateShopping(data, [], today), state, today);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    quantity: 2,
    sources: ['Restock', 'Manual'],
    manualIds: ['m'],
  });
});
it('keeps unrelated units separate and rounds only explicitly compatible packages', () => {
  expect(
    packageSuggestion(650, 'g', { packageSize: 1, packageUnit: 'kg', packagePrice: 2 }),
  ).toEqual({ count: 1, size: 1000, quantity: 1000, remainder: 350, price: 2 });
  expect(packageSuggestion(650, 'g', { packageSize: 1, packageUnit: 'bottle' })).toBeUndefined();
});
it('retains partial manual purchases, records actual units and removes completed items', () => {
  const state = emptyCompanion();
  state.manual.push({
    id: 'm',
    name: 'Sponge',
    quantity: 3,
    unit: 'piece',
    category: 'Household',
    store: 'Costco',
    notes: '',
  });
  const line = buildLines(
    { ...data, items: [], groups: [] },
    calculateShopping({ ...data, items: [], groups: [] }, [], today),
    state,
    today,
  )[0];
  const actual = { name: 'Sponge', quantity: 1, unit: 'piece' } as AddItemData;
  const next = completePurchase(state, line, 1, actual, today);
  expect(next.manual[0].quantity).toBe(2);
  expect(next.carry).toEqual({});
  expect(next.history[0].quantity).toBe(1);
  expect(completePurchase(state, line, 3, actual, today).manual).toEqual([]);
  expect(state.manual[0].quantity).toBe(3);
});
it('preserves carry-forward without duplicating a current calculation', () => {
  const state = emptyCompanion();
  const row = buildLines(data, calculateShopping(data, [], today), state, today)[0];
  state.carry[row.id] = { ...row, quantity: 99, carryPeriod: 'old' };
  expect(
    buildLines(data, calculateShopping(data, [], today), state, today, 'new')[0].quantity,
  ).toBe(1);
  expect(
    buildLines({ ...data, groups: [] }, calculateShopping(data, [], today), state, today, 'new')[0]
      .carried,
  ).toBe(true);
});
it('classifies supermarket sections conservatively and rejects executable product URLs', () => {
  expect(departmentFor('Tomato passata')).toBe('Pantry');
  expect(departmentFor('Tomatoes')).toBe('Fruit & vegetables');
  expect(departmentFor('Milk')).toBe('Dairy & eggs');
  expect(departmentFor('Mystery ingredient')).toBe('Other');
  expect(safeProductLink('javascript:alert(1)')).toBeUndefined();
  expect(safeProductLink('https://www.carrefour.es/')).toBe('https://www.carrefour.es/');
});
it('postponement expires and skip is limited to its planning period', () => {
  const state = emptyCompanion();
  state.deferred.x = { kind: 'skip', period: 'old' };
  expect(isDeferred(state, 'x', today, 'new')).toBe(false);
  state.deferred.x = { kind: 'later', until: '2026-09-08' };
  expect(isDeferred(state, 'x', today, 'new')).toBe(true);
  expect(isDeferred(state, 'x', '2026-09-08', 'new')).toBe(false);
});

it('explicit package conversions follow remaining real stock and expiration without mutating inventory', () => {
  const state = emptyCompanion();
  state.mappings = {
    h: { name: 'Honey', groupId: 'honey', unit: 'ml', purchasedUnit: 'bottle', ratio: 500 },
  };
  const converted = shoppingInventory(data, state);
  expect(converted.items[0]).toMatchObject({
    quantity: 500,
    unit: 'ml',
    expirationDate: '2028-01-01',
  });
  expect(data.items[0].quantity).toBe(1);
  expect(
    shoppingInventory({ ...data, items: [{ ...data.items[0], quantity: 0.5 }] }, state).items[0]
      .quantity,
  ).toBe(250);
  expect(shoppingInventory({ ...data, items: [] }, state).items).toEqual([]);
});
it('requires three distinct purchase dates before suggesting a cadence', () => {
  const entry = { id: 'h', name: 'Honey', quantity: 1, unit: 'bottle', date: '2026-09-01' };
  expect(purchaseCadence([entry, entry, entry])).toEqual([]);
  expect(
    purchaseCadence([entry, { ...entry, date: '2026-09-08' }, { ...entry, date: '2026-09-15' }])[0],
  ).toMatchObject({ interval: 7, count: 3 });
});
it('rejects corrupted saved data instead of silently overwriting it', () => {
  localStorage.setItem('companion-test', JSON.stringify({ ...emptyCompanion(), budget: -1 }));
  expect(() => readCompanion('companion-test')).toThrow('Invalid budget');
  localStorage.setItem('companion-test', JSON.stringify({ ...emptyCompanion(), manual: [null] }));
  expect(() => readCompanion('companion-test')).toThrow();
  localStorage.removeItem('companion-test');
});

it('repeated partial purchases reduce carried quantities instead of restoring the old demand', () => {
  const state = emptyCompanion();
  const line = {
    ...buildLines(data, calculateShopping(data, [], today), state, today)[0],
    carried: true,
    quantity: 3,
  };
  const actual = { name: 'Honey', quantity: 1, unit: 'bottle' } as AddItemData;
  const first = completePurchase(state, line, 1, actual, today);
  expect(first.carry[line.id].quantity).toBe(2);
  const second = completePurchase(first, first.carry[line.id], 1, actual, today);
  expect(second.carry[line.id].quantity).toBe(1);
});
