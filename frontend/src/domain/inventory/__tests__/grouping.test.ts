import { groupItemsByGroupingKey, replaceInventoryGroup } from '../grouping';
import type { InventoryItem, InventoryGroup } from '../types';

const group: InventoryGroup = {
  groupId: 'rice',
  canonicalKey: 'rice|food|g',
  name: 'Rice',
  category: 'Food',
  unit: 'g',
  totalQuantity: 1000,
  isLowStock: true,
  threshold: 1,
  thresholdUnit: 'kg',
  syncVersion: 1,
  createdAt: '',
  updatedAt: '',
};
const item: InventoryItem = {
  itemId: 'a',
  groupId: 'rice',
  name: 'Rice',
  category: 'Food',
  unit: 'g',
  quantity: 500,
  location: 'pantry',
  expirationDate: '2030-01-01',
  createdAt: '',
  updatedAt: '',
};

it('shows converted visible quantities in the group unit while keeping group-owned thresholds', () => {
  const items = [item, { ...item, itemId: 'b', unit: 'Kilo', quantity: 0.5, location: 'freezer' }];
  const before = JSON.stringify(items);
  expect(groupItemsByGroupingKey(items, [group])[0]).toMatchObject({
    totalQuantity: 1000,
    unit: 'g',
    thresholdUnit: 'kg',
    hasLowStock: true,
  });
  expect(groupItemsByGroupingKey([items[1]], [group])[0]).toMatchObject({
    totalQuantity: 500,
    unit: 'g',
    childCount: 1,
  });
  expect(JSON.stringify(items)).toBe(before);
});

it('flags mixed dimensions rather than presenting an invented sum', () => {
  expect(
    groupItemsByGroupingKey([item, { ...item, itemId: 'b', unit: 'ml' }], [group])[0]
      .hasIncompatibleUnits,
  ).toBe(true);
});

it('keeps the first visible unit for an orphaned explicit group and converts compatible lots', () => {
  expect(
    groupItemsByGroupingKey([item, { ...item, itemId: 'b', unit: 'kg', quantity: 0.5 }])[0],
  ).toMatchObject({ totalQuantity: 1000, unit: 'g' });
});

it('removes a deleted empty group response without leaving undefined rows or altering other groups', () => {
  const other = { ...group, groupId: 'other' };
  const groups = [group, other];
  expect(replaceInventoryGroup(groups, 'rice')).toEqual([other]);
  expect(groups).toEqual([group, other]);
});
