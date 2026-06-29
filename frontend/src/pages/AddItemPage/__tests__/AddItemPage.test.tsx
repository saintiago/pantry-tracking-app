import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import AddItemPage from '../AddItemPage';
import type { AddItemPageProps } from '../AddItemPage';
import type { StorageLocation } from '../../../api/locations/locations';
import type { InventoryItem, InventorySearchResponse } from '../../../api/inventory/inventory';

// Mock the inventory API module so selecting an autocomplete suggestion triggers
// performFullAutofill with a known item, and external barcode lookups are inert.
jest.mock('../../../api/inventory/inventory', () => ({
  searchInventory: jest.fn(),
  lookupBarcode: jest.fn(),
}));

import { searchInventory, lookupBarcode } from '../../../api/inventory/inventory';

// The autocomplete search is debounced (~300ms) then resolves asynchronously.
// Under parallel jest workers the polling window can be starved, so allow a
// generous timeout and raise the per-test timeout to give the debounce room.
jest.setTimeout(20000);
const DROPDOWN_TIMEOUT = 10000;

const mockSearchInventory = searchInventory as jest.MockedFunction<typeof searchInventory>;
const mockLookupBarcode = lookupBarcode as jest.MockedFunction<typeof lookupBarcode>;

const LOCATIONS: StorageLocation[] = [
  { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
];

// A known existing item whose comparable fields the form will mirror after autofill.
const MILK_ITEM: InventoryItem = {
  itemId: 'item-1',
  name: 'Milk',
  category: 'Dairy',
  expirationDate: '2025-06-01',
  location: 'loc-1',
  quantity: 2,
  unit: 'l',
  isLowStock: false,
  brand: 'DairyCo',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// Yellow merge-state palette (Req 6.1) and existing blue prefilled palette (Req 6.2).
const MERGE_YELLOW_BG = '#fef9c3';
const MERGE_YELLOW_TEXT = '#854d0e';
const PREFILLED_BLUE_BG = '#e0f2fe';

let showPickerMock: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  // jsdom does not implement showPicker; stub it so we can assert invocations (Req 4.3)
  // without the component's try/catch swallowing a missing-method error.
  showPickerMock = jest.fn();
  (HTMLInputElement.prototype as unknown as { showPicker: () => void }).showPicker =
    showPickerMock;
  // Default: every field search returns nothing (no dropdown). Tests override `name`.
  mockSearchInventory.mockResolvedValue({
    field: 'name',
    query: '',
    resultType: 'values',
    values: [],
    count: 0,
  } as InventorySearchResponse);
  mockLookupBarcode.mockResolvedValue({ found: false });
});

function renderPage(overrides: Partial<AddItemPageProps> = {}) {
  const onBack = jest.fn();
  const onSubmit = jest.fn().mockResolvedValue({});
  render(
    <AddItemPage
      onBack={onBack}
      onSubmit={onSubmit}
      locations={LOCATIONS}
      {...overrides}
    />,
  );
  return { onBack, onSubmit };
}

/**
 * Drives a full Autofill by typing into the name field, waiting for the mocked
 * search dropdown to appear, and selecting the single suggestion. Returns once the
 * autofill has applied (category copied from the suggestion).
 */
async function autofillFromNameSuggestion(
  user: ReturnType<typeof userEvent.setup>,
  item: InventoryItem,
) {
  mockSearchInventory.mockImplementation(async (field): Promise<InventorySearchResponse> => {
    if (field === 'name') {
      return {
        field: 'name',
        query: item.name,
        resultType: 'items',
        items: [item],
        count: 1,
      };
    }
    return { field, query: '', resultType: 'values', values: [], count: 0 };
  });

  const nameInput = screen.getByLabelText(/Product Name/i) as HTMLInputElement;
  await user.type(nameInput, item.name);

  // Scope to the autocomplete dropdown item (select <option> elements also expose
  // the "option" role, so query by the dropdown item's test id instead). The search
  // is debounced ~300ms then resolves asynchronously, so allow generous polling time.
  const option = await screen.findByTestId('dropdown-item-0', {}, { timeout: DROPDOWN_TIMEOUT });
  await user.click(option);

  const categoryInput = screen.getByLabelText(/Category/i) as HTMLInputElement;
  await waitFor(() => expect(categoryInput.value).toBe(item.category));
}

describe('AddItemPage — merge-state behavior', () => {
  describe('expiration-date autofill (Req 4.3, 4.4, 4.5)', () => {
    it('copies expiration, focuses the field, and opens the picker when empty (Req 4.3)', async () => {
      const user = userEvent.setup();
      renderPage();

      await autofillFromNameSuggestion(user, MILK_ITEM);

      const expirationInput = screen.getByLabelText(/Expiration Date/i) as HTMLInputElement;
      // Copied from the suggestion (Req 4.1)
      expect(expirationInput.value).toBe(MILK_ITEM.expirationDate);
      // Focus moves to the field and the date picker is opened (Req 4.3)
      await waitFor(() => expect(showPickerMock).toHaveBeenCalled());
      expect(expirationInput).toHaveFocus();
    });

    it('leaves a user-entered expiration unchanged and does not focus or open the picker (Req 4.4)', async () => {
      const user = userEvent.setup();
      renderPage();

      const expirationInput = screen.getByLabelText(/Expiration Date/i) as HTMLInputElement;
      // User enters their own expiration before selecting a suggestion.
      fireEvent.change(expirationInput, { target: { value: '2025-01-15' } });

      await autofillFromNameSuggestion(user, MILK_ITEM);

      expect(expirationInput.value).toBe('2025-01-15');
      expect(showPickerMock).not.toHaveBeenCalled();
      expect(expirationInput).not.toHaveFocus();
    });

    it('leaves the expiration field unchanged when the suggestion has no expiration (Req 4.5)', async () => {
      const user = userEvent.setup();
      renderPage();

      await autofillFromNameSuggestion(user, { ...MILK_ITEM, expirationDate: '' });

      const expirationInput = screen.getByLabelText(/Expiration Date/i) as HTMLInputElement;
      expect(expirationInput.value).toBe('');
      expect(showPickerMock).not.toHaveBeenCalled();
    });
  });

  describe('submit-button label and merge highlight (Req 5, 6)', () => {
    it('shows "new" in the label when no suggestion has been selected (Req 5.4)', () => {
      renderPage();
      const submit = screen.getByRole('button', { name: /add new item/i });
      expect(submit).toBeInTheDocument();
      expect(submit).toHaveTextContent(/new/i);
      expect(screen.getByTestId('action-bar')).toHaveAttribute('data-merge-state', 'false');
    });

    it('enters merge state after autofill: label and yellow palette (Req 5.1, 6.1)', async () => {
      const user = userEvent.setup();
      renderPage();

      await autofillFromNameSuggestion(user, MILK_ITEM);

      expect(screen.getByTestId('action-bar')).toHaveAttribute('data-merge-state', 'true');
      expect(screen.getByRole('button', { name: /add to existing item/i })).toBeInTheDocument();

      // Prefilled fields render with the yellow merge palette (Req 6.1)
      const nameInput = screen.getByLabelText(/Product Name/i);
      expect(nameInput).toHaveStyle({
        backgroundColor: MERGE_YELLOW_BG,
        color: MERGE_YELLOW_TEXT,
      });
    });

    it('editing a non-quantity prefilled field flips the label to "new" and reverts highlight to blue (Req 5.3, 6.2, 6.3, 6.4)', async () => {
      const user = userEvent.setup();
      renderPage();

      await autofillFromNameSuggestion(user, MILK_ITEM);
      expect(screen.getByRole('button', { name: /add to existing item/i })).toBeInTheDocument();

      // Edit the prefilled brand field so it differs from the autofill snapshot.
      const brandInput = screen.getByLabelText(/Brand/i) as HTMLInputElement;
      fireEvent.change(brandInput, { target: { value: 'OtherBrand' } });

      // Label updates synchronously to include "new" (Req 5.3)
      const submit = screen.getByRole('button', { name: /add new item/i });
      expect(submit).toHaveTextContent(/new/i);
      expect(screen.getByTestId('action-bar')).toHaveAttribute('data-merge-state', 'false');

      // The edited field clears its individual highlight (Req 6.4)
      expect(brandInput).not.toHaveStyle({ backgroundColor: MERGE_YELLOW_BG });
      expect(brandInput).not.toHaveStyle({ backgroundColor: PREFILLED_BLUE_BG });

      // A still-prefilled field reverts from yellow to the blue prefilled highlight (Req 6.2, 6.3)
      const nameInput = screen.getByLabelText(/Product Name/i);
      expect(nameInput).toHaveStyle({ backgroundColor: PREFILLED_BLUE_BG });
    });

    it('editing only the quantity keeps the merge label and yellow highlight (Req 5.5, 6.5)', async () => {
      const user = userEvent.setup();
      renderPage();

      await autofillFromNameSuggestion(user, MILK_ITEM);

      const quantityInput = screen.getByLabelText(/Quantity/i) as HTMLInputElement;
      fireEvent.change(quantityInput, { target: { value: '5' } });

      // Quantity is excluded from merge state, so the label/highlight stay unchanged.
      expect(screen.getByRole('button', { name: /add to existing item/i })).toBeInTheDocument();
      expect(screen.getByTestId('action-bar')).toHaveAttribute('data-merge-state', 'true');

      const nameInput = screen.getByLabelText(/Product Name/i);
      expect(nameInput).toHaveStyle({
        backgroundColor: MERGE_YELLOW_BG,
        color: MERGE_YELLOW_TEXT,
      });
    });
  });

  describe('submission progress (Req 5.6)', () => {
    it('disables the submit button and shows progress text while submitting', async () => {
      const user = userEvent.setup();
      // onSubmit never resolves so the submitting state persists for assertion.
      let resolveSubmit: ((value: { error?: string }) => void) | undefined;
      const onSubmit = jest.fn(
        () => new Promise<{ error?: string }>((resolve) => { resolveSubmit = resolve; }),
      );

      renderPage({ onSubmit });

      // Autofill fills every required field (name, category, expiration, location,
      // quantity, unit), so the form passes validation on submit.
      await autofillFromNameSuggestion(user, MILK_ITEM);

      const submit = screen.getByRole('button', { name: /add to existing item/i });
      await user.click(submit);

      const submittingButton = await screen.findByRole('button', { name: /adding/i });
      expect(submittingButton).toBeDisabled();
      expect(onSubmit).toHaveBeenCalledTimes(1);

      // Resolve to let pending state settle and avoid post-test act warnings.
      resolveSubmit?.({});
    });
  });
});
