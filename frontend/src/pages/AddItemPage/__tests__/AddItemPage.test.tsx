import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import AddItemPage from '../AddItemPage';
import type { AddItemPageProps } from '../AddItemPage';
import type { StorageLocation } from '../../../api/locations/locations';
import type { InventorySearchResponse } from '../../../api/inventory/inventory';

// Mock the inventory API module so selecting an autocomplete suggestion triggers
// performFullAutofill with a known item, and external barcode lookups are inert.
jest.mock('../../../api/inventory/inventory', () => ({
  searchInventory: jest.fn(),
  lookupBarcode: jest.fn(),
}));

import { searchInventory, lookupBarcode } from '../../../api/inventory/inventory';

const mockSearchInventory = searchInventory as jest.MockedFunction<typeof searchInventory>;
const mockLookupBarcode = lookupBarcode as jest.MockedFunction<typeof lookupBarcode>;

const LOCATIONS: StorageLocation[] = [
  { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
];

beforeEach(() => {
  jest.resetAllMocks();
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

describe('AddItemPage', () => {
  it('renders the add item form with submit label "Add new item"', () => {
    renderPage();
    expect(screen.getByLabelText(/Product Name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add new item' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty form', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Add new item' }));

    await waitFor(() => {
      expect(screen.getByText('Product name is required.')).toBeInTheDocument();
      expect(screen.getByText('Category is required.')).toBeInTheDocument();
      expect(screen.getByText('Expiration date is required.')).toBeInTheDocument();
      expect(screen.getByText('Storage location is required.')).toBeInTheDocument();
      expect(screen.getByText('Quantity is required.')).toBeInTheDocument();
    });
  });

  it('calls onSubmit with form data when valid', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPage();

    await user.type(screen.getByLabelText(/Product Name/i), 'Milk');
    await user.type(screen.getByLabelText(/Category/i), 'Dairy');
    await user.type(screen.getByLabelText(/Expiration Date/i), '2026-12-31');
    await user.selectOptions(screen.getByLabelText(/Storage Location/i), 'loc-1');
    await user.type(screen.getByLabelText(/Quantity/i), '2');

    await user.click(screen.getByRole('button', { name: 'Add new item' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Milk',
          category: 'Dairy',
          expirationDate: '2026-12-31',
          locationId: 'loc-1',
          quantity: 2,
          unit: 'piece',
        }),
      );
    });
  });

  it('shows success message and calls onBack after successful submission', async () => {
    const user = userEvent.setup();
    const { onBack } = renderPage();

    await user.type(screen.getByLabelText(/Product Name/i), 'Milk');
    await user.type(screen.getByLabelText(/Category/i), 'Dairy');
    await user.type(screen.getByLabelText(/Expiration Date/i), '2026-12-31');
    await user.selectOptions(screen.getByLabelText(/Storage Location/i), 'loc-1');
    await user.type(screen.getByLabelText(/Quantity/i), '2');

    await user.click(screen.getByRole('button', { name: 'Add new item' }));

    await waitFor(() => {
      expect(screen.getByText('Item added successfully!')).toBeInTheDocument();
    });

    // After the 1200ms delay, onBack should be called
    await waitFor(() => expect(onBack).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('shows error when submission fails', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue({ error: 'Something went wrong' });
    renderPage({ onSubmit });

    await user.type(screen.getByLabelText(/Product Name/i), 'Milk');
    await user.type(screen.getByLabelText(/Category/i), 'Dairy');
    await user.type(screen.getByLabelText(/Expiration Date/i), '2026-12-31');
    await user.selectOptions(screen.getByLabelText(/Storage Location/i), 'loc-1');
    await user.type(screen.getByLabelText(/Quantity/i), '2');

    await user.click(screen.getByRole('button', { name: 'Add new item' }));

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });
});
