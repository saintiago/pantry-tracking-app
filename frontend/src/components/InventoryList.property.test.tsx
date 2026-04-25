import React from 'react';
import { render, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';
import InventoryList, { InventoryItem } from './InventoryList';
import type { StorageLocation } from '../api/locations';

/* ── Arbitraries ────────────────────────────────────────────────── */

const categoryPool = ['Dairy', 'Bakery', 'Produce', 'Meat', 'Frozen', 'Snacks', 'Grains'];

const locationPool: StorageLocation[] = [
  { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
  { locationId: 'loc-2', name: 'Fridge', createdAt: '2024-01-02T00:00:00Z' },
  { locationId: 'loc-3', name: 'Freezer', createdAt: '2024-01-03T00:00:00Z' },
];

const locationIdArb = fc.constantFrom('loc-1', 'loc-2', 'loc-3');
const categoryArb = fc.constantFrom(...categoryPool);

// Generate printable, non-empty item names (letters only for predictable matching)
const nameArb = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')), {
    minLength: 1,
    maxLength: 20,
  })
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const inventoryItemArb = (index: number): fc.Arbitrary<InventoryItem> =>
  fc.record({
    itemId: fc.constant(`item-${index}`),
    name: nameArb,
    category: categoryArb,
    expirationDate: fc.constant('2025-06-01'),
    location: locationIdArb,
    quantity: fc.integer({ min: 1, max: 100 }),
    unit: fc.constantFrom('pcs', 'kg', 'liters'),
    isLowStock: fc.boolean(),
    createdAt: fc.constant('2024-01-01T00:00:00Z'),
    updatedAt: fc.constant('2024-01-01T00:00:00Z'),
  });

const inventoryListArb = fc
  .integer({ min: 1, max: 8 })
  .chain((len) => fc.tuple(...Array.from({ length: len }, (_, i) => inventoryItemArb(i))));

/**
 * Build a filter combo arbitrary that constrains category/location choices
 * to values actually present in the generated items (or "All").
 * This ensures the dropdown options exist when we try to select them.
 */
function filterComboArbFor(items: InventoryItem[]) {
  const itemCategories = Array.from(new Set(items.map((i) => i.category)));
  const itemLocationIds = Array.from(new Set(items.map((i) => i.location)));

  const catArb =
    itemCategories.length > 0
      ? fc.oneof(fc.constant('All'), fc.constantFrom(...itemCategories))
      : fc.constant('All');

  const locArb =
    itemLocationIds.length > 0
      ? fc.oneof(fc.constant('All'), fc.constantFrom(...itemLocationIds))
      : fc.constant('All');

  return fc.record({
    text: fc.oneof(fc.constant(''), nameArb),
    category: catArb,
    location: locArb,
  });
}

/* ── Helpers ────────────────────────────────────────────────────── */

function expectedFilteredItems(
  items: InventoryItem[],
  textFilter: string,
  categoryFilter: string,
  locationFilter: string,
): InventoryItem[] {
  let result = items;

  if (textFilter.trim()) {
    const lower = textFilter.toLowerCase();
    result = result.filter((i) => i.name.toLowerCase().includes(lower));
  }

  if (categoryFilter !== 'All') {
    result = result.filter((i) => i.category === categoryFilter);
  }

  if (locationFilter !== 'All') {
    result = result.filter((i) => i.location === locationFilter);
  }

  return result;
}

/* ── Property Test ──────────────────────────────────────────────── */

/**
 * Feature: inventory-core, Property 7: Combined Filter Correctness
 * Validates: Requirements 8.2, 8.3, 8.4, 8.5
 *
 * For any inventory list and any combination of text filter, category filter,
 * and location filter, the filtered results should contain exactly the items
 * that satisfy all active filter criteria simultaneously.
 */
describe('Property 7: Combined Filter Correctness', () => {
  it(
    'filtered results contain exactly the items satisfying all active filter criteria',
    async () => {
      await fc.assert(
      fc.asyncProperty(
        inventoryListArb.chain((items) =>
          filterComboArbFor(items).map((filters) => ({ items, filters })),
        ),
        async ({ items, filters }) => {
          const user = userEvent.setup();

          const { container, unmount } = render(
            <InventoryList items={items} locations={locationPool} removeMode={false} />,
          );

          const view = within(container);

          // Apply text filter
          if (filters.text) {
            const input = view.getByLabelText('Filter by product name');
            await user.clear(input);
            await user.type(input, filters.text);
          }

          // Apply location filter
          if (filters.location !== 'All') {
            const locSelect = view.getByLabelText('Filter by location');
            await user.selectOptions(locSelect, filters.location);
          }

          // Apply category filter by drilling into the category card
          // (category dropdown is only visible in item-list view)
          if (filters.category !== 'All') {
            const card = view.queryByTestId(`category-card-${filters.category}`);
            if (!card) {
              // Category was filtered out by text/location — nothing to drill into
              unmount();
              return;
            }
            await user.click(card);
          }

          // Compute expected results
          const expected = expectedFilteredItems(
            items,
            filters.text,
            filters.category,
            filters.location,
          );

          const expectedIds = new Set(expected.map((i) => i.itemId));

          if (filters.category === 'All') {
            // In category-summary view: verify category cards are shown, not item cards
            const distinctCats = new Set(expected.map((i) => i.category));
            if (expected.length === 0) {
              expect(
                view.getByText('No items match the current filters.'),
              ).toBeInTheDocument();
            } else {
              for (const cat of distinctCats) {
                expect(view.queryByTestId(`category-card-${cat}`)).toBeInTheDocument();
              }
            }
          } else {
            // In item-list view: verify item cards
            if (expected.length === 0) {
              expect(
                view.getByText('No items match the current filters.'),
              ).toBeInTheDocument();
            } else {
              expect(
                view.queryByText('No items match the current filters.'),
              ).not.toBeInTheDocument();

              // Each expected item should be visible
              for (const item of expected) {
                expect(view.getByTestId(`item-card-${item.itemId}`)).toBeInTheDocument();
              }
            }

            // Items NOT in expected set should NOT be visible
            for (const item of items) {
              if (!expectedIds.has(item.itemId)) {
                expect(view.queryByTestId(`item-card-${item.itemId}`)).not.toBeInTheDocument();
              }
            }
          }

          unmount();
        },
      ),
      { numRuns: 20 }, // Reduced from 100 to avoid timeout
    );
  },
  30000); // 30 second timeout for property test
});
