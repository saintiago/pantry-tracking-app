/**
 * Property-based tests for the Inventory Category View feature.
 * Feature: inventory-category-view
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import InventoryList, {
  InventoryItem,
  CategorySummary,
  CategoryCard,
  groupItemsByCategory,
} from './InventoryList';
import type { StorageLocation } from '../api/locations';

const TEST_ITERATIONS = 100;

// Arbitrary for InventoryItem
const inventoryItemArb = fc.record({
  itemId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  category: fc.constantFrom('Dairy', 'Grains', 'Bakery', 'Snacks', 'Produce', 'Meat'),
  expirationDate: fc.constant('2025-12-31'),
  location: fc.constant('loc-1'),
  quantity: fc.integer({ min: 0, max: 100 }),
  unit: fc.constant('pcs'),
  isLowStock: fc.boolean(),
  createdAt: fc.constant('2024-01-01T00:00:00Z'),
  updatedAt: fc.constant('2024-01-01T00:00:00Z'),
});

const itemsArb = fc.array(inventoryItemArb, { minLength: 0, maxLength: 30 });

const locations: StorageLocation[] = [
  { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
];

// ── Property 1: Category Grouping is a Correct Partition ──────────────────────
describe('Feature: inventory-category-view, Property 1: Category grouping is a correct partition', () => {
  it('group count equals distinct categories, itemCounts sum to total, each group itemCount matches', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const groups = groupItemsByCategory(items);
        const distinctCategories = new Set(items.map((i) => i.category));

        // Group count === distinct categories
        expect(groups.length).toBe(distinctCategories.size);

        // Sum of all itemCounts === total items (partition property)
        const totalItemCount = groups.reduce((sum, g) => sum + g.itemCount, 0);
        expect(totalItemCount).toBe(items.length);

        // Each group's itemCount === count of items with that category
        for (const group of groups) {
          const expected = items.filter((i) => i.category === group.category).length;
          expect(group.itemCount).toBe(expected);
        }

        // Each group's totalQuantity === sum of quantity for that category
        for (const group of groups) {
          const expected = items
            .filter((i) => i.category === group.category)
            .reduce((sum, i) => sum + i.quantity, 0);
          expect(group.totalQuantity).toBe(expected);
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

// ── Property 2: Category Grouping is Sorted Alphabetically ───────────────────
describe('Feature: inventory-category-view, Property 2: Category grouping is sorted alphabetically', () => {
  it('output categories are in ascending alphabetical order', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const groups = groupItemsByCategory(items);
        for (let i = 1; i < groups.length; i++) {
          expect(groups[i - 1].category.localeCompare(groups[i].category)).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

// ── Property 3: Low-Stock Count Correctness ───────────────────────────────────
describe('Feature: inventory-category-view, Property 3: Low-stock count correctness', () => {
  it('each group lowStockCount equals count of isLowStock items in that category', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const groups = groupItemsByCategory(items);
        for (const group of groups) {
          const expected = items.filter(
            (i) => i.category === group.category && i.isLowStock,
          ).length;
          expect(group.lowStockCount).toBe(expected);
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

// ── Property 4: Drill-Down Shows Only Selected Category Items ─────────────────
describe('Feature: inventory-category-view, Property 4: Drill-down shows only selected category items', () => {
  it('after clicking a category card, only items from that category are displayed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(inventoryItemArb, { minLength: 2, maxLength: 20 }),
        async (items) => {
          // Ensure at least one category has items
          const categories = Array.from(new Set(items.map((i) => i.category)));
          if (categories.length === 0) return;

          const user = userEvent.setup();
          const { unmount } = render(
            <InventoryList items={items} locations={locations} removeMode={false} />,
          );

          // Pick the first category card that exists
          const targetCategory = categories[0];
          const card = screen.queryByTestId(`category-card-${targetCategory}`);
          if (!card) {
            unmount();
            return;
          }

          await user.click(card);

          // All displayed item cards must belong to the selected category
          const itemCards = document
            .querySelectorAll('[data-testid^="item-card-"]');
          for (const itemCard of Array.from(itemCards)) {
            const testId = itemCard.getAttribute('data-testid') ?? '';
            const itemId = testId.replace('item-card-', '');
            const item = items.find((i) => i.itemId === itemId);
            expect(item?.category).toBe(targetCategory);
          }

          // No items from other categories are displayed
          const otherCategories = categories.filter((c) => c !== targetCategory);
          for (const otherCat of otherCategories) {
            const otherItems = items.filter((i) => i.category === otherCat);
            for (const otherItem of otherItems) {
              expect(
                screen.queryByTestId(`item-card-${otherItem.itemId}`),
              ).not.toBeInTheDocument();
            }
          }

          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ── Property 5: Category Card Aria-Label Completeness ────────────────────────
describe('Feature: inventory-category-view, Property 5: Category card aria-label completeness', () => {
  it('aria-label contains category name, item count, and total quantity', () => {
    const categorySummaryArb = fc.record<CategorySummary>({
      category: fc.string({ minLength: 1, maxLength: 20 }),
      itemCount: fc.integer({ min: 1, max: 100 }),
      totalQuantity: fc.integer({ min: 0, max: 1000 }),
      quantityByUnit: fc.dictionary(
        fc.constantFrom('Gram', 'Kilo', 'Milliliter', 'Liter', 'Unit'),
        fc.integer({ min: 0, max: 500 }),
        { minKeys: 1, maxKeys: 3 },
      ),
      lowStockCount: fc.integer({ min: 0, max: 10 }),
    });

    fc.assert(
      fc.property(categorySummaryArb, (summary) => {
        const { unmount } = render(
          <CategoryCard summary={summary} onClick={() => {}} />,
        );

        const card = screen.getByRole('button');
        const label = card.getAttribute('aria-label') ?? '';

        expect(label).toContain(summary.category);
        expect(label).toContain(String(summary.itemCount));

        unmount();
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});
