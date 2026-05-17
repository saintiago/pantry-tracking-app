// Feature: recipe-search-filter, Property 7: Inventory index sums correctly per lowercase name

import * as fc from 'fast-check';
import { buildInventoryIndex } from '../availability';

/**
 * Validates: Requirement 5.5
 *
 * For any list of inventory items I and any string name,
 * buildInventoryIndex(I).get(name.toLowerCase()) equals the sum of item.quantity
 * over items whose lowercased name matches; absent key resolves to undefined (treated as 0).
 */
describe('Property 7: Inventory index sums correctly per lowercase name', () => {
  it(
    'buildInventoryIndex(I).get(name.toLowerCase()) equals the sum of quantities for matching items',
    () => {
      const inventoryItemArb = fc.record({
        name: fc.string({ minLength: 1, maxLength: 20 }),
        quantity: fc.integer({ min: 0, max: 1000 }),
      });

      fc.assert(
        fc.property(
          fc.array(inventoryItemArb, { maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (items, name) => {
            const index = buildInventoryIndex(items);
            const key = name.toLowerCase();

            // Compute expected sum for this key
            const expectedSum = items
              .filter((item) => item.name.toLowerCase() === key)
              .reduce((acc, item) => acc + item.quantity, 0);

            const indexValue = index.get(key);

            if (expectedSum === 0) {
              // No matching items: key should be absent (undefined)
              expect(indexValue).toBeUndefined();
            } else {
              // Matching items exist: value should equal the sum
              expect(indexValue).toBe(expectedSum);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
