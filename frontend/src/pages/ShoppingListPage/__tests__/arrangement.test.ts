import { arrangeLines, shoppingIcon } from '../arrangement';
import { departmentFor } from '../departments';
import type { ShoppingLine } from '../companion';
const line = (name: string, addedAt: string, extra: Partial<ShoppingLine> = {}): ShoppingLine => ({
  id: name,
  name,
  addedAt,
  department: departmentFor(name),
  category: 'Food',
  unit: 'g',
  quantity: 100,
  reserve: 0,
  extra: 0,
  manualIds: [],
  sources: ['Manual'],
  store: '',
  unknown: false,
  ...extra,
});
test('aisles put produce before meat, bakery, dairy and herbs; rare foods get meaningful icons', () => {
  const lines = [
    line('fenugreek', ''),
    line('milk', ''),
    line('bread', ''),
    line('chicken', ''),
    line('ginger', ''),
  ];
  expect(arrangeLines(lines, 'aisle').map((g) => g.lines[0].name)).toEqual([
    'ginger',
    'chicken',
    'bread',
    'milk',
    'fenugreek',
  ]);
  expect(shoppingIcon(lines[0])).toBe('🌿');
  expect(shoppingIcon(lines[4])).toBe('🫚');
  expect(shoppingIcon({ ...lines[4], icon: '⭐' })).toBe('⭐');
});
test('recent and alphabetical sorting are deterministic and do not mutate input', () => {
  const items = [line('Ginger', '2026-09-08'), line('Apple', '2026-09-07')];
  expect(arrangeLines(items, 'az')[0].lines[0].name).toBe('Apple');
  expect(arrangeLines(items, 'recent')[0].lines[0].name).toBe('Ginger');
  expect(items[0].name).toBe('Ginger');
});
test('recipe arrangement never duplicates combined ingredients', () => {
  const shared = line('Milk', '', {
    meal: {
      contributions: [{ recipeName: 'Pancakes' }, { recipeName: 'Porridge' }],
    } as ShoppingLine['meal'],
  });
  expect(arrangeLines([shared], 'recipe')).toEqual([
    { title: 'Pancakes + Porridge', lines: [shared] },
  ]);
});
