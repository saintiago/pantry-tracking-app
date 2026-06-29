/**
 * Property-based tests for the grouping pure function of the
 * inventory-merge-and-grouping feature.
 *
 * Covers Properties 9–14 against `groupItemsByGroupingKey` (and the
 * `normalizeGroupName` / `GroupedRow` contract) exported from InventoryList.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import InventoryList, {
  groupItemsByGroupingKey,
  normalizeGroupName,
} from '../InventoryList';
import type { InventoryItem } from '../InventoryList';
import type { StorageLocation } from '../../../api/locations';
import { UNIT_METADATA, getUnitLabel, resolveUnit } from '../../../types/units';
import { formatQuantity } from '../../../utils/quantity';

const TEST_ITERATIONS = 100;

/* ── Local replicas of the grouping normalization rules ───────────── */
// These mirror the implementation so the tests assert against an
// independently-derived expectation rather than the code under test.
const normName = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();
const normCategory = (s: string): string => s.trim().toLowerCase();
const expectedKey = (item: InventoryItem): string =>
  `${normName(item.name)}|${normCategory(item.category)}|${resolveUnit(item.unit)}`;

/* ── Generators ───────────────────────────────────────────────────── */

// Whitespace runs (incl. tabs/newlines) used to create case/whitespace variants.
const whitespaceArb = fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { maxLength: 2 });

// Names that vary in casing and internal/leading/trailing whitespace but
// collapse to a small set of normalized base names so groups collide.
const nameArb = fc
  .tuple(
    fc.constantFrom('milk', 'almond milk', 'olive oil', 'white rice', 'free range eggs'),
    whitespaceArb,
    whitespaceArb,
    fc.integer({ min: 1, max: 3 }),
    fc.boolean(),
  )
  .map(([base, lead, trail, pad, upper]) => {
    const recased = upper ? base.toUpperCase() : base;
    const spaced = recased.replace(/ /g, ' '.repeat(pad));
    return `${lead}${spaced}${trail}`;
  });

// Categories that vary in casing and surrounding whitespace (no internal
// whitespace, matching the trim + lowercase normalization rule for category).
const categoryArb = fc
  .tuple(fc.constantFrom('Dairy', 'Grains', 'Produce'), whitespaceArb, whitespaceArb, fc.boolean())
  .map(([base, lead, trail, upper]) => `${lead}${upper ? base.toUpperCase() : base}${trail}`);

// Mix of modern unit keys and legacy labels so resolveUnit collapses them.
const unitArb = fc.constantFrom(
  'g',
  'kg',
  'ml',
  'l',
  'piece',
  'cup',
  'tsp',
  'can',
  'Gram',
  'Kilo',
  'Milliliter',
  'Liter',
  'Unit',
);

// Integers plus exactly-representable quarter fractions so sums stay exact and
// order-independent under IEEE-754 arithmetic.
const quantityArb = fc.oneof(
  fc.integer({ min: 0, max: 1000 }),
  fc.integer({ min: 0, max: 4000 }).map((n) => n / 4),
);

// Small date pools so ties surface and tie-breakers get exercised.
const expirationArb = fc.constantFrom('2024-01-01', '2025-06-15', '2025-12-31', '2026-03-10');
const createdAtArb = fc.constantFrom(
  '2024-01-01T00:00:00Z',
  '2024-05-20T12:30:00Z',
  '2025-02-10T08:00:00Z',
);

const inventoryItemArb: fc.Arbitrary<InventoryItem> = fc.record({
  itemId: fc.uuid(),
  name: nameArb,
  category: categoryArb,
  expirationDate: expirationArb,
  location: fc.constantFrom('loc-1', 'loc-2'),
  quantity: quantityArb,
  unit: unitArb,
  isLowStock: fc.boolean(),
  createdAt: createdAtArb,
  updatedAt: fc.constant('2024-01-01T00:00:00Z'),
});

const itemsArb = fc.array(inventoryItemArb, { minLength: 0, maxLength: 30 });

/* ── Property 9 ───────────────────────────────────────────────────── */
// Feature: inventory-merge-and-grouping, Property 9: Grouping partitions the
// displayed items exactly — child sets are pairwise disjoint, their union
// equals the input set, and child counts sum to the input count.
// Validates: Requirements 7.1, 7.3, 7.4, 7.5
describe('Feature: inventory-merge-and-grouping, Property 9: Grouping partitions the displayed items exactly', () => {
  it('child items across groups are a disjoint partition of the input', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const groups = groupItemsByGroupingKey(items);

        const allChildren = groups.flatMap((g) => g.childItems);

        // Union size equals input size and sum of childCount equals input count.
        expect(allChildren.length).toBe(items.length);
        expect(groups.reduce((sum, g) => sum + g.childCount, 0)).toBe(items.length);

        // childCount matches the actual number of children in each group.
        for (const g of groups) {
          expect(g.childCount).toBe(g.childItems.length);
        }

        // Every input item appears exactly once across all groups (by identity).
        const childSet = new Set(allChildren);
        expect(childSet.size).toBe(items.length);
        for (const item of items) {
          expect(childSet.has(item)).toBe(true);
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

/* ── Property 10 ──────────────────────────────────────────────────── */
// Feature: inventory-merge-and-grouping, Property 10: Grouping keys normalize
// names and units — two items share a group iff their names match after
// trim/collapse-whitespace/lowercase, categories match after trim/lowercase,
// and units resolve to the same canonical key (legacy + modern group together).
// Validates: Requirements 7.6, 7.7
describe('Feature: inventory-merge-and-grouping, Property 10: Grouping keys normalize names and units', () => {
  it('each item lands in the group whose key equals its normalized key', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const groups = groupItemsByGroupingKey(items);

        // Map every child item to the group that contains it.
        const groupOf = new Map<InventoryItem, string>();
        for (const g of groups) {
          for (const child of g.childItems) {
            groupOf.set(child, g.groupingKey);
          }
        }

        // Each item's containing group key equals its independently-derived key.
        for (const item of items) {
          expect(groupOf.get(item)).toBe(expectedKey(item));
        }

        // Two items co-group iff their normalized keys match.
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const sameGroup = groupOf.get(items[i]) === groupOf.get(items[j]);
            const sameKey = expectedKey(items[i]) === expectedKey(items[j]);
            expect(sameGroup).toBe(sameKey);
          }
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

/* ── Property 11 ──────────────────────────────────────────────────── */
// Feature: inventory-merge-and-grouping, Property 11: Grouped rows are ordered
// by ascending normalized case-insensitive name, tie-broken by ascending
// canonical unit key.
// Validates: Requirements 7.8
describe('Feature: inventory-merge-and-grouping, Property 11: Grouped rows are ordered by name then unit', () => {
  it('groups are sorted by normalized name then canonical unit key', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const groups = groupItemsByGroupingKey(items);

        for (let i = 1; i < groups.length; i++) {
          const prev = groups[i - 1];
          const cur = groups[i];
          const nameCompare = normalizeGroupName(prev.name).localeCompare(
            normalizeGroupName(cur.name),
          );
          expect(nameCompare).toBeLessThanOrEqual(0);
          if (nameCompare === 0) {
            expect(prev.unit.localeCompare(cur.unit)).toBeLessThanOrEqual(0);
          }
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

/* ── Property 12 ──────────────────────────────────────────────────── */
// Feature: inventory-merge-and-grouping, Property 12: Child items are ordered
// by non-decreasing expirationDate, tie-broken by ascending createdAt and then
// ascending itemId.
// Validates: Requirements 8.2
describe('Feature: inventory-merge-and-grouping, Property 12: Child items are ordered by expiration', () => {
  it('children sort by expirationDate, then createdAt, then itemId', () => {
    const cmp = (a: InventoryItem, b: InventoryItem): number => {
      if (a.expirationDate !== b.expirationDate) return a.expirationDate < b.expirationDate ? -1 : 1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      if (a.itemId !== b.itemId) return a.itemId < b.itemId ? -1 : 1;
      return 0;
    };

    fc.assert(
      fc.property(itemsArb, (items) => {
        const groups = groupItemsByGroupingKey(items);
        for (const g of groups) {
          for (let i = 1; i < g.childItems.length; i++) {
            expect(cmp(g.childItems[i - 1], g.childItems[i])).toBeLessThanOrEqual(0);
          }
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

/* ── Property 13 ──────────────────────────────────────────────────── */
// Feature: inventory-merge-and-grouping, Property 13: Grouped row summary is
// correct — total quantity equals the exact sum of children (displayed with at
// most 2 decimals, trailing zeros/point stripped), child count equals the
// number of children, and the unit uses the singular label iff the total is 1.
// Validates: Requirements 9.1, 9.2, 9.5, 9.6, 9.7
describe('Feature: inventory-merge-and-grouping, Property 13: Grouped row summary is correct', () => {
  it('summarizes total quantity, child count, and singular/plural unit label', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const groups = groupItemsByGroupingKey(items);

        for (const g of groups) {
          // Total quantity equals the exact sum of child quantities.
          const expectedTotal = g.childItems.reduce((sum, c) => sum + c.quantity, 0);
          expect(g.totalQuantity).toBeCloseTo(expectedTotal, 10);

          // Child count equals the number of children.
          expect(g.childCount).toBe(g.childItems.length);

          // Displayed total uses at most 2 decimal places.
          const formatted = formatQuantity(g.totalQuantity);
          if (formatted.includes('.')) {
            const decimals = formatted.split('.')[1];
            expect(decimals.length).toBeLessThanOrEqual(2);
          }

          // Unit label is singular iff the total equals 1, plural otherwise.
          const meta = UNIT_METADATA[g.unit];
          const label = getUnitLabel(g.unit, g.totalQuantity);
          if (g.totalQuantity === 1) {
            expect(label).toBe(meta.singular);
          } else {
            expect(label).toBe(meta.plural);
          }
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

/* ── Property 14 ──────────────────────────────────────────────────── */
// Feature: inventory-merge-and-grouping, Property 14: Group low-stock indicator
// correctness — hasLowStock is true iff at least one child is low-stock.
// Validates: Requirements 9.3, 9.4
describe('Feature: inventory-merge-and-grouping, Property 14: Group low-stock indicator correctness', () => {
  it('hasLowStock is true iff any child item is low-stock', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const groups = groupItemsByGroupingKey(items);
        for (const g of groups) {
          expect(g.hasLowStock).toBe(g.childItems.some((c) => c.isLowStock));
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

/* ── Property 15 ──────────────────────────────────────────────────── */
// Feature: inventory-merge-and-grouping, Property 15: Expand/collapse toggles
// children and preserves state — activating a Grouped_Row toggles between
// showing and hiding its Child_Items, and across any recomputation (e.g. a
// filter change) in which a group's Grouping_Key remains present, that group's
// expanded/collapsed state is preserved.
// Validates: Requirements 8.1, 8.3, 8.5

// Rendering-based property runs are heavier than pure-function runs, so keep the
// iteration count modest and give the suite a generous timeout.
const RENDER_TEST_ITERATIONS = 25;
const RENDER_TEST_TIMEOUT_MS = 30000;

// All items live in a single fixed category so drilling into the category view
// is deterministic (exactly one category card to click).
const FIXED_CATEGORY = 'Dairy';

const locations: StorageLocation[] = [
  { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
  { locationId: 'loc-2', name: 'Fridge', createdAt: '2024-01-02T00:00:00Z' },
];

// Clean, brace-free names with stable casing/spacing so that every child in a
// group shares an identical raw name. This keeps grouping predictable for the
// rendered DOM and lets a text filter target a group by typing its name.
// (Name/unit normalization is exercised separately by Properties 10–11.)
const renderNameArb = fc.constantFrom('Milk', 'Rice', 'Eggs', 'Olive Oil', 'Butter');
// Canonical unit keys only — distinct units split a shared name into separate
// groups, exercising multi-group rendering.
const renderUnitArb = fc.constantFrom('l', 'kg', 'piece', 'g');

const renderItemArb: fc.Arbitrary<InventoryItem> = fc.record({
  itemId: fc.uuid(),
  name: renderNameArb,
  category: fc.constant(FIXED_CATEGORY),
  expirationDate: expirationArb,
  location: fc.constantFrom('loc-1', 'loc-2'),
  quantity: fc.integer({ min: 1, max: 50 }),
  unit: renderUnitArb,
  isLowStock: fc.boolean(),
  createdAt: createdAtArb,
  updatedAt: fc.constant('2024-01-01T00:00:00Z'),
});

const renderItemsArb = fc.array(renderItemArb, { minLength: 1, maxLength: 6 });

describe('Feature: inventory-merge-and-grouping, Property 15: Expand/collapse toggles children and preserves state', () => {
  it(
    'activating a grouped row toggles its child items between shown and hidden',
    async () => {
      await fc.assert(
        fc.asyncProperty(renderItemsArb, async (items) => {
          const user = userEvent.setup({ delay: null });
          const { unmount } = render(
            <InventoryList items={items} locations={locations} removeMode={false} />,
          );
          try {
            // Drill into the single category to reach the grouped item-list view.
            await user.click(screen.getByTestId(`category-card-${FIXED_CATEGORY}`));

            const groups = groupItemsByGroupingKey(items);
            const target = groups[0];
            const rowTestId = `grouped-row-${target.groupingKey}`;

            // Collapsed by default: none of the target's child cards are rendered.
            for (const child of target.childItems) {
              expect(screen.queryByTestId(`item-card-${child.itemId}`)).toBeNull();
            }

            // Activate → expanded: every child card becomes visible.
            await user.click(screen.getByTestId(rowTestId));
            for (const child of target.childItems) {
              expect(screen.getByTestId(`item-card-${child.itemId}`)).toBeInTheDocument();
            }

            // Activate again → collapsed: every child card is hidden once more.
            await user.click(screen.getByTestId(rowTestId));
            for (const child of target.childItems) {
              expect(screen.queryByTestId(`item-card-${child.itemId}`)).toBeNull();
            }
          } finally {
            unmount();
          }
        }),
        { numRuns: RENDER_TEST_ITERATIONS },
      );
    },
    RENDER_TEST_TIMEOUT_MS,
  );

  it(
    'preserves a group expanded state across a recompute that keeps its key present',
    async () => {
      await fc.assert(
        fc.asyncProperty(renderItemsArb, async (items) => {
          const user = userEvent.setup({ delay: null });
          const { unmount } = render(
            <InventoryList items={items} locations={locations} removeMode={false} />,
          );
          try {
            await user.click(screen.getByTestId(`category-card-${FIXED_CATEGORY}`));

            const groups = groupItemsByGroupingKey(items);
            const target = groups[0];
            const rowTestId = `grouped-row-${target.groupingKey}`;

            // Expand the target group and confirm its children are visible.
            await user.click(screen.getByTestId(rowTestId));
            for (const child of target.childItems) {
              expect(screen.getByTestId(`item-card-${child.itemId}`)).toBeInTheDocument();
            }

            // Change the text filter to the group's name. This recomputes the
            // grouped rows but keeps the target group's Grouping_Key present
            // (all its children share that exact name), so its expanded state
            // must survive the recompute.
            const filterInput = screen.getByLabelText('Filter by product name');
            await user.clear(filterInput);
            await user.type(filterInput, target.name);

            // The group is still present and still expanded: children remain visible.
            expect(screen.getByTestId(rowTestId)).toHaveAttribute('aria-expanded', 'true');
            for (const child of target.childItems) {
              expect(screen.getByTestId(`item-card-${child.itemId}`)).toBeInTheDocument();
            }
          } finally {
            unmount();
          }
        }),
        { numRuns: RENDER_TEST_ITERATIONS },
      );
    },
    RENDER_TEST_TIMEOUT_MS,
  );
});
