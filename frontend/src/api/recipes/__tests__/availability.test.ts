import { buildInventoryIndex, computeAllAvailable } from '../availability';
import type { InventoryIndex } from '../availability';
import type { RecipeIngredient } from '../recipes';

describe('buildInventoryIndex', () => {
  it('produces an empty Map for an empty input', () => {
    const result = buildInventoryIndex([]);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('lowercases names and merges "Eggs" and "eggs" into one entry summing their quantities', () => {
    const items = [
      { name: 'Eggs', quantity: 6 },
      { name: 'eggs', quantity: 4 },
    ];
    const result = buildInventoryIndex(items);
    expect(result.size).toBe(1);
    expect(result.get('eggs')).toBe(10);
  });

  it('creates separate entries for distinct names', () => {
    const items = [
      { name: 'Milk', quantity: 2 },
      { name: 'Butter', quantity: 1 },
    ];
    const result = buildInventoryIndex(items);
    expect(result.size).toBe(2);
    expect(result.get('milk')).toBe(2);
    expect(result.get('butter')).toBe(1);
  });

  it('does not mutate the input array', () => {
    const items = [{ name: 'Flour', quantity: 500 }];
    const copy = [...items];
    buildInventoryIndex(items);
    expect(items).toEqual(copy);
  });
});

describe('computeAllAvailable', () => {
  it('returns true for an empty ingredient list (vacuous)', () => {
    const index: InventoryIndex = new Map();
    expect(computeAllAvailable([], index)).toBe(true);
  });

  it('returns true when all ingredients have sufficient quantity', () => {
    const index = buildInventoryIndex([
      { name: 'Eggs', quantity: 6 },
      { name: 'Flour', quantity: 500 },
    ]);
    const ingredients: RecipeIngredient[] = [
      { name: 'Eggs', quantity: 3, unit: 'Unit' },
      { name: 'Flour', quantity: 200, unit: 'Gram' },
    ];
    expect(computeAllAvailable(ingredients, index)).toBe(true);
  });

  it('returns false when any ingredient required quantity exceeds the index value', () => {
    const index = buildInventoryIndex([{ name: 'Eggs', quantity: 2 }]);
    const ingredients: RecipeIngredient[] = [{ name: 'Eggs', quantity: 6, unit: 'Unit' }];
    expect(computeAllAvailable(ingredients, index)).toBe(false);
  });

  it('returns false against an empty InventoryIndex for any recipe with at least one ingredient (Requirement 5.4)', () => {
    const emptyIndex: InventoryIndex = new Map();
    const ingredients: RecipeIngredient[] = [{ name: 'Milk', quantity: 1, unit: 'Liter' }];
    expect(computeAllAvailable(ingredients, emptyIndex)).toBe(false);
  });

  it('is case-insensitive when matching ingredient names against the index', () => {
    const index = buildInventoryIndex([{ name: 'eggs', quantity: 12 }]);
    const ingredients: RecipeIngredient[] = [{ name: 'Eggs', quantity: 6, unit: 'Unit' }];
    expect(computeAllAvailable(ingredients, index)).toBe(true);
  });
});
