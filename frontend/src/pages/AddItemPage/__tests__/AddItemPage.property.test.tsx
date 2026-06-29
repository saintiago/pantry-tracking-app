import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fc from 'fast-check';

// Mock the inventory API module so no real network / auth is exercised. AddItemPage
// only consumes `searchInventory` (autocomplete) and `lookupBarcode` (barcode field)
// from this module at runtime; the rest are type-only.
jest.mock('../../../api/inventory/inventory', () => ({
  searchInventory: jest.fn(),
  lookupBarcode: jest.fn(),
}));

import AddItemPage, { isMergeState } from '../AddItemPage';
import type { AutofillSnapshot } from '../AddItemPage';
import { searchInventory, lookupBarcode } from '../../../api/inventory/inventory';
import type { InventoryItem } from '../../../api/inventory/inventory';
import type { StorageLocation } from '../../../api/locations/locations';

const mockSearch = searchInventory as jest.MockedFunction<typeof searchInventory>;
const mockLookup = lookupBarcode as jest.MockedFunction<typeof lookupBarcode>;

// fast-check iteration count for the pure predicate property (Req: ≥ 100).
const TEST_ITERATIONS = 100;
// Render-based properties mount the full component and drive the autocomplete
// flow, so they use a smaller run count (mirroring the existing reduced render
// property tests in the repo) while staying well above a trivial sample.
const RENDER_ITERATIONS = 20;

/* ── Shared fixtures / helpers ──────────────────────────────────── */

const locations: StorageLocation[] = [
  { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
];

// Every text field present on the form, all empty. isMergeState compares the
// snapshot against the current form, so we model the form as a flat string map.
function baseForm(): Record<string, string> {
  return {
    name: '',
    category: '',
    expirationDate: '',
    locationId: '',
    quantity: '',
    unit: '',
    barcode: '',
    brand: '',
    whereToBuy: '',
    onlineStoreLink: '',
  };
}

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    itemId: 'item-1',
    name: 'Milk',
    category: 'Dairy',
    expirationDate: '2025-06-01',
    location: 'loc-1',
    quantity: 1,
    unit: 'g',
    isLowStock: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    brand: 'BrandA',
    whereToBuy: 'StoreA',
    onlineStoreLink: 'https://example.com/p',
    barcode: '12345678',
    ...overrides,
  } as InventoryItem;
}

// Normalize a CSS color (jsdom may serialize hex inline styles as `rgb(...)`)
// to a lowercase `#rrggbb` string so assertions are stable across environments.
function normColor(c: string): string {
  if (!c) return '';
  const m = c.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
  if (m) {
    const hex = (n: string) => Number(n).toString(16).padStart(2, '0');
    return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
  }
  return c.toLowerCase();
}

const MERGE_BG = '#fef9c3'; // yellow merge highlight background (Req 6.1)
const MERGE_TEXT = '#854d0e'; // yellow merge highlight text
const PREFILLED_BG = '#e0f2fe'; // existing blue prefilled background (Req 6.2)

function renderPage() {
  const onSubmit = jest.fn().mockResolvedValue({});
  const onBack = jest.fn();
  const utils = render(<AddItemPage onBack={onBack} onSubmit={onSubmit} locations={locations} />);
  return { ...utils, onSubmit, onBack };
}

// Drive the name-field autocomplete to a selected suggestion, which invokes the
// component's internal performFullAutofill and records the AutofillSnapshot.
async function selectNameSuggestion(item: InventoryItem) {
  mockSearch.mockResolvedValue({
    field: 'name',
    query: 'Mil',
    resultType: 'items',
    items: [item],
    count: 1,
  });

  const nameInput = document.getElementById('add-item-name') as HTMLInputElement;
  // Single change event (3 chars) crosses the name search threshold and schedules
  // the debounced search; the mocked response then opens the dropdown.
  fireEvent.change(nameInput, { target: { value: 'Mil' } });

  const option = await screen.findByTestId('dropdown-item-0', {}, { timeout: 3000 });
  // Suggestions are committed via onMouseDown (see AutocompleteDropdown).
  fireEvent.mouseDown(option);
}

function submitButton(): HTMLButtonElement {
  return document.querySelector('button[type="submit"]') as HTMLButtonElement;
}

function mergeStateAttr(): string | null {
  return screen.getByTestId('action-bar').getAttribute('data-merge-state');
}

/* ── Arbitraries for the pure predicate property ────────────────── */

const valueArb = fc.string({ minLength: 1, maxLength: 6 });

// A snapshot is a record of field -> originally-populated value. We optionally
// include `quantity` (which the predicate must ignore) and always guarantee at
// least one non-quantity field so the "mismatch" cases have something to break.
const snapshotArb: fc.Arbitrary<AutofillSnapshot> = fc
  .record({
    name: fc.option(valueArb, { nil: undefined }),
    category: fc.option(valueArb, { nil: undefined }),
    brand: fc.option(valueArb, { nil: undefined }),
    barcode: fc.option(valueArb, { nil: undefined }),
    whereToBuy: fc.option(valueArb, { nil: undefined }),
    onlineStoreLink: fc.option(valueArb, { nil: undefined }),
    unit: fc.option(valueArb, { nil: undefined }),
    locationId: fc.option(valueArb, { nil: undefined }),
    expirationDate: fc.option(valueArb, { nil: undefined }),
    quantity: fc.option(valueArb, { nil: undefined }),
  })
  .map((obj) => {
    const snap: AutofillSnapshot = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) snap[k] = v as string;
    }
    if (Object.keys(snap).filter((k) => k !== 'quantity').length === 0) {
      snap.name = 'Item';
    }
    return snap;
  });

/* ── Property 7 (pure predicate) ────────────────────────────────── */

// Feature: inventory-merge-and-grouping, Property 7: Merge-state predicate drives
// label and highlight, excluding quantity.
// Validates: Requirements 5.1, 5.2, 5.5, 6.5, 6.6
describe('Property 7: isMergeState predicate (pure)', () => {
  it('returns false when there is no snapshot regardless of the form', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.string()), (form) => {
        expect(isMergeState(null, form as Record<string, string>)).toBe(false);
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });

  it('is true iff every non-quantity snapshot field equals the form value', () => {
    fc.assert(
      fc.property(snapshotArb, valueArb, (snap, qty) => {
        // Form keeps every non-quantity field equal to the snapshot and varies
        // quantity freely -> must be in merge state (Req 5.1, quantity excluded).
        const form = { ...baseForm(), ...snap, quantity: qty };
        expect(isMergeState(snap, form)).toBe(true);
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });

  it('is false when any single non-quantity field diverges (changed or cleared)', () => {
    fc.assert(
      fc.property(snapshotArb, (snap) => {
        const fields = Object.keys(snap).filter((k) => k !== 'quantity');
        for (const f of fields) {
          // Changing one non-quantity field to a different value breaks merge.
          const changed = { ...baseForm(), ...snap, [f]: `${snap[f]}_diff` };
          expect(isMergeState(snap, changed)).toBe(false);

          // Clearing/omitting one non-quantity field also breaks merge.
          const cleared: Record<string, string> = { ...baseForm(), ...snap };
          delete cleared[f];
          expect(isMergeState(snap, cleared)).toBe(false);
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });

  it('ignores the quantity field entirely (Req 5.5, 6.5)', () => {
    fc.assert(
      fc.property(snapshotArb, valueArb, valueArb, (snap, q1, q2) => {
        const formA = { ...baseForm(), ...snap, quantity: q1 };
        const formB = { ...baseForm(), ...snap, quantity: q2 };
        // Differing only by quantity must never change the predicate, and since
        // all non-quantity fields equal the snapshot both are in merge state.
        expect(isMergeState(snap, formA)).toBe(isMergeState(snap, formB));
        expect(isMergeState(snap, formA)).toBe(true);
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

/* ── Property 7 (rendered wiring: label + highlight) ────────────── */

// Feature: inventory-merge-and-grouping, Property 7: Merge-state predicate drives
// label and highlight, excluding quantity.
// Validates: Requirements 5.1, 5.2, 5.5, 6.1, 6.2, 6.5, 6.6
describe('Property 7: merge state drives submit label and field highlight', () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockLookup.mockReset();
    mockLookup.mockResolvedValue({ found: false });
  });

  it(
    'label and prefilled highlight follow the predicate; editing only quantity never changes them',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('none', 'quantity', 'nonquantity'),
          async (editKind) => {
            const { unmount } = renderPage();
            try {
              await selectNameSuggestion(makeItem());

              // After a full autofill with an untouched form, every prefilled
              // non-quantity field matches the snapshot -> merge state.
              await waitFor(() => expect(mergeStateAttr()).toBe('true'));
              expect(submitButton()).toHaveTextContent('Add to existing item');

              if (editKind === 'quantity') {
                // Editing only quantity must NOT leave merge state (Req 5.5, 6.5).
                fireEvent.change(document.getElementById('add-item-quantity')!, {
                  target: { value: '7' },
                });
              } else if (editKind === 'nonquantity') {
                // Editing a non-quantity prefilled field leaves merge state.
                fireEvent.change(document.getElementById('add-item-brand')!, {
                  target: { value: 'Different Brand' },
                });
              }

              const expectMerge = editKind !== 'nonquantity';
              await waitFor(() =>
                expect(mergeStateAttr()).toBe(String(expectMerge)),
              );

              // Submit label reflects the predicate (Req 5.1, 5.2).
              if (expectMerge) {
                expect(submitButton()).toHaveTextContent('Add to existing item');
              } else {
                expect(submitButton().textContent || '').toMatch(/new/i);
              }

              // The `name` field stays prefilled and untouched in all branches, so
              // its highlight is driven purely by merge state (Req 6.1, 6.2, 6.6).
              const nameInput = document.getElementById('add-item-name') as HTMLInputElement;
              if (expectMerge) {
                expect(normColor(nameInput.style.backgroundColor)).toBe(MERGE_BG);
                expect(normColor(nameInput.style.color)).toBe(MERGE_TEXT);
              } else {
                expect(normColor(nameInput.style.backgroundColor)).toBe(PREFILLED_BG);
                expect(normColor(nameInput.style.color)).toBe('');
              }
            } finally {
              unmount();
            }
          },
        ),
        { numRuns: RENDER_ITERATIONS },
      );
    },
    30000,
  );
});

/* ── Property 8 (rendered: expiration autofill) ─────────────────── */

// Feature: inventory-merge-and-grouping, Property 8: Expiration autofill copies
// only into an empty field.
// Validates: Requirements 4.1, 4.2, 4.4
describe('Property 8: expiration autofill copies only into an empty field', () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockLookup.mockReset();
    mockLookup.mockResolvedValue({ found: false });
  });

  it(
    'copies the suggestion expiration iff it is non-empty and the field is empty; marks it prefilled',
    async () => {
      const USER_VALUE = '2024-03-03';
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('', '2025-06-01'),
          fc.boolean(),
          async (suggestionExp, fieldEmpty) => {
            const { unmount } = renderPage();
            try {
              const expInput = document.getElementById(
                'add-item-expiration',
              ) as HTMLInputElement;

              // Pre-seed a user-entered expiration value when the field is not empty.
              if (!fieldEmpty) {
                fireEvent.change(expInput, { target: { value: USER_VALUE } });
                await waitFor(() => expect(expInput.value).toBe(USER_VALUE));
              }

              await selectNameSuggestion(makeItem({ expirationDate: suggestionExp }));

              // The other autofilled fields establish merge state in every case.
              await waitFor(() => expect(mergeStateAttr()).toBe('true'));

              const expectedCopied = suggestionExp !== '' && fieldEmpty;

              // Req 4.1 / 4.4 / 4.5: value is copied only into an empty field from a
              // non-empty suggestion; a user value or an empty suggestion is untouched.
              await waitFor(() => {
                if (expectedCopied) {
                  expect(expInput.value).toBe(suggestionExp);
                } else if (!fieldEmpty) {
                  expect(expInput.value).toBe(USER_VALUE);
                } else {
                  expect(expInput.value).toBe('');
                }
              });

              // Req 4.2: when copied, the expiration field is marked prefilled, so it
              // participates in the merge snapshot — editing it breaks merge state.
              // When it was NOT copied, it is not part of the snapshot, so editing it
              // leaves merge state intact.
              fireEvent.change(expInput, { target: { value: '2024-01-01' } });
              await waitFor(() =>
                expect(mergeStateAttr()).toBe(String(!expectedCopied)),
              );
            } finally {
              unmount();
            }
          },
        ),
        { numRuns: RENDER_ITERATIONS },
      );
    },
    30000,
  );
});
