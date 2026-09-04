import {
  calculateLowStock,
  convertThreshold,
  canonicalGroupKey,
  canonicalUnit,
  defaultGroupId,
  normalizeGroupCategory,
  normalizeGroupName,
} from '../inventory-groups';

describe('inventory groups', () => {
  it('converts compatible threshold units and checks the inclusive boundary', () => {
    expect(convertThreshold(1, 'kg', 'g')).toBe(1000);
    expect(convertThreshold(500, 'ml', 'l')).toBe(0.5);
    expect(convertThreshold(2, 'bottle', 'bottle')).toBe(2);
    expect(convertThreshold(2, 'bottle', 'kg')).toBeNull();
    expect(calculateLowStock(1000, 1, 'kg', 'g')).toBe(true);
    expect(calculateLowStock(1001, 1, 'kg', 'g')).toBe(false);
    expect(calculateLowStock(1, undefined, 'kg', 'g')).toBe(false);
  });
  it('normalizes the runtime grouping fields consistently', () => {
    expect(normalizeGroupName('  Almond   Milk ')).toBe('almond milk');
    expect(normalizeGroupCategory(' DAIRY ')).toBe('dairy');
    expect(canonicalUnit('Liter')).toBe('l');
    expect(canonicalGroupKey(' Almond  Milk ', 'DAIRY', 'Liter')).toBe('almond milk|dairy|l');
  });

  it('assigns equivalent products the same stable default group id', () => {
    expect(defaultGroupId('Milk', 'Dairy', 'Liter')).toBe(defaultGroupId(' milk ', 'dairy', 'l'));
    expect(defaultGroupId('Milk', 'Dairy', 'Liter')).not.toBe(
      defaultGroupId('Milk', 'Dairy', 'piece'),
    );
  });

  it('compares the aggregate total to the optional threshold', () => {
    expect(calculateLowStock(2, 2)).toBe(true);
    expect(calculateLowStock(1, 2)).toBe(true);
    expect(calculateLowStock(3, 2)).toBe(false);
    expect(calculateLowStock(0)).toBe(false);
  });
});
