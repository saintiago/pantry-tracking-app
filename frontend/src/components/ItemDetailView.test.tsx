import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import ItemDetailView, { validateEditForm } from './ItemDetailView';
import type { EditFormState } from './ItemDetailView';
import type { InventoryItem } from './InventoryList';
import type { StorageLocation } from '../api/locations';
import { updateInventoryItem } from '../api/inventory';

jest.mock('../api/inventory', () => ({
  updateInventoryItem: jest.fn(),
}));

const mockUpdateInventoryItem = updateInventoryItem as jest.MockedFunction<
  typeof updateInventoryItem
>;

const mockLocations: StorageLocation[] = [
  { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
  { locationId: 'loc-2', name: 'Fridge', createdAt: '2024-01-01T00:00:00Z' },
];

const baseItem: InventoryItem = {
  itemId: 'item-1',
  name: 'Organic Milk',
  category: 'Dairy',
  expirationDate: '2025-02-15',
  location: 'loc-2',
  quantity: 3,
  unit: 'Liter',
  isLowStock: false,
  createdAt: '2024-12-01T10:00:00Z',
  updatedAt: '2025-01-10T14:30:00Z',
};

const onClose = jest.fn();
const onItemUpdated = jest.fn();

function renderDetail(item: InventoryItem = baseItem) {
  return render(
    <ItemDetailView
      item={item}
      locations={mockLocations}
      onClose={onClose}
      onItemUpdated={onItemUpdated}
    />,
  );
}

describe('ItemDetailView — opens in edit mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the overlay and panel', () => {
    renderDetail();
    expect(screen.getByTestId('item-detail-overlay')).toBeInTheDocument();
  });

  it('displays the item name in the header', () => {
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Organic Milk' })).toBeInTheDocument();
  });

  it('displays low-stock badge when isLowStock is true', () => {
    renderDetail({ ...baseItem, isLowStock: true });
    expect(screen.getByText('Low Stock')).toBeInTheDocument();
  });

  it('does not display low-stock badge when isLowStock is false', () => {
    renderDetail({ ...baseItem, isLowStock: false });
    expect(screen.queryByText('Low Stock')).not.toBeInTheDocument();
  });

  it('renders pictureUrl as an image', () => {
    renderDetail({ ...baseItem, pictureUrl: 'https://example.com/milk.jpg' });
    const img = screen.getByRole('img', { name: 'Organic Milk' });
    expect(img).toHaveAttribute('src', 'https://example.com/milk.jpg');
  });

  it('shows Save and Cancel buttons immediately (no Edit button)', () => {
    renderDetail();
    expect(screen.getByTestId('save-button')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-button')).toBeInTheDocument();
    expect(screen.queryByTestId('edit-button')).not.toBeInTheDocument();
  });

  it('pre-populates form fields with current item values', () => {
    const fullItem: InventoryItem = {
      ...baseItem,
      brand: 'Horizon',
      barcode: '123456789',
      whereToBuy: 'Whole Foods',
      onlineStoreLink: 'https://example.com/buy',
      threshold: 2,
    };
    renderDetail(fullItem);

    expect(screen.getByLabelText(/Product Name/)).toHaveValue('Organic Milk');
    expect(screen.getByLabelText(/Category/)).toHaveValue('Dairy');
    expect(screen.getByLabelText(/Storage Location/)).toHaveValue('loc-2');
    expect(screen.getByLabelText(/Quantity/)).toHaveValue(3);
    expect(screen.getByLabelText(/Unit/)).toHaveValue('Liter');
    expect(screen.getByLabelText(/Expiration Date/)).toHaveValue('2025-02-15');
    expect(screen.getByLabelText(/Brand/)).toHaveValue('Horizon');
    expect(screen.getByLabelText(/Barcode/)).toHaveValue('123456789');
    expect(screen.getByLabelText(/Where to Buy/)).toHaveValue('Whole Foods');
    expect(screen.getByLabelText(/Online Store Link/)).toHaveValue('https://example.com/buy');
    expect(screen.getByLabelText(/Low-Stock Threshold/)).toHaveValue(2);
  });

  it('initializes optional fields as empty when absent', () => {
    renderDetail();
    expect(screen.getByLabelText(/Brand/)).toHaveValue('');
    expect(screen.getByLabelText(/Barcode/)).toHaveValue('');
    expect(screen.getByLabelText(/Where to Buy/)).toHaveValue('');
    expect(screen.getByLabelText(/Online Store Link/)).toHaveValue('');
    expect(screen.getByLabelText(/Low-Stock Threshold/)).toHaveValue(null);
  });

  it('renders all 11 editable fields', () => {
    renderDetail();
    expect(screen.getByLabelText(/Product Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Category/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Storage Location/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantity/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Unit/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Expiration Date/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Brand/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Barcode/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Where to Buy/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Online Store Link/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Low-Stock Threshold/)).toBeInTheDocument();
  });

  it('renders correct input types', () => {
    renderDetail();
    expect(screen.getByLabelText(/Product Name/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/Category/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/Quantity/)).toHaveAttribute('type', 'number');
    // Unit is a <select>, not a text input
    expect(screen.getByLabelText(/Unit/).tagName).toBe('SELECT');
    expect(screen.getByLabelText(/Expiration Date/)).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText(/Online Store Link/)).toHaveAttribute('type', 'url');
    expect(screen.getByLabelText(/Low-Stock Threshold/)).toHaveAttribute('type', 'number');
  });

  it('renders location as a select with options', () => {
    renderDetail();
    const select = screen.getByLabelText(/Storage Location/) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain('Pantry');
    expect(options).toContain('Fridge');
  });

  it('marks required fields with aria-required', () => {
    renderDetail();
    expect(screen.getByLabelText(/Product Name/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Category/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Storage Location/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Quantity/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Unit/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/Expiration Date/)).toHaveAttribute('aria-required', 'true');
  });

  it('calls onClose when close button is clicked', async () => {
    renderDetail();
    await userEvent.click(screen.getByLabelText('Close detail view'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel is clicked', async () => {
    renderDetail();
    await userEvent.click(screen.getByTestId('cancel-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close button meets minimum tap target size', () => {
    renderDetail();
    expect(screen.getByLabelText('Close detail view')).toHaveStyle({
      minWidth: '44px',
      minHeight: '44px',
    });
  });

  it('Save and Cancel buttons meet minimum tap target size', () => {
    renderDetail();
    expect(screen.getByTestId('save-button')).toHaveStyle({
      minWidth: '44px',
      minHeight: '44px',
    });
    expect(screen.getByTestId('cancel-button')).toHaveStyle({
      minWidth: '44px',
      minHeight: '44px',
    });
  });
});

const validForm: EditFormState = {
  name: 'Milk',
  category: 'Dairy',
  locationId: 'loc-1',
  quantity: '3',
  unit: 'gallons',
  expirationDate: '2025-06-01',
  brand: '',
  barcode: '',
  whereToBuy: '',
  onlineStoreLink: '',
  threshold: '',
};

describe('validateEditForm', () => {
  it('returns no errors for a valid form', () => {
    expect(validateEditForm(validForm)).toEqual({});
  });

  it('returns error when name is empty', () => {
    expect(validateEditForm({ ...validForm, name: '  ' }).name).toBe(
      'Product name is required.',
    );
  });

  it('returns error when category is empty', () => {
    expect(validateEditForm({ ...validForm, category: '' }).category).toBe(
      'Category is required.',
    );
  });

  it('returns error when expirationDate is empty', () => {
    expect(validateEditForm({ ...validForm, expirationDate: '' }).expirationDate).toBe(
      'Expiration date is required.',
    );
  });

  it('returns error when locationId is empty', () => {
    expect(validateEditForm({ ...validForm, locationId: '' }).locationId).toBe(
      'Storage location is required.',
    );
  });

  it('returns error when quantity is empty', () => {
    expect(validateEditForm({ ...validForm, quantity: '' }).quantity).toBe(
      'Quantity is required.',
    );
  });

  it('returns error when quantity is non-numeric', () => {
    expect(validateEditForm({ ...validForm, quantity: 'abc' }).quantity).toBe(
      'Quantity is required.',
    );
  });

  it('returns error when quantity is negative', () => {
    expect(validateEditForm({ ...validForm, quantity: '-1' }).quantity).toBe(
      'Quantity must be non-negative.',
    );
  });

  it('accepts zero quantity', () => {
    expect(validateEditForm({ ...validForm, quantity: '0' }).quantity).toBeUndefined();
  });

  it('returns error when unit is empty', () => {
    expect(validateEditForm({ ...validForm, unit: '  ' }).unit).toBe('Unit is required.');
  });

  it('returns multiple errors for multiple invalid fields', () => {
    const errors = validateEditForm({ ...validForm, name: '', category: '', unit: '' });
    expect(errors.name).toBeDefined();
    expect(errors.category).toBeDefined();
    expect(errors.unit).toBeDefined();
  });
});

describe('ItemDetailView — validation on save', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows validation errors when saving with empty required fields', async () => {
    renderDetail();
    await userEvent.clear(screen.getByLabelText(/Product Name/));
    await userEvent.selectOptions(screen.getByLabelText(/Unit/), '');
    await userEvent.click(screen.getByTestId('save-button'));
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Product name is required.')).toBeInTheDocument();
    expect(screen.getByText('Unit is required.')).toBeInTheDocument();
  });

  it('prevents submission when validation fails', async () => {
    renderDetail();
    await userEvent.clear(screen.getByLabelText(/Product Name/));
    await userEvent.click(screen.getByTestId('save-button'));
    expect(mockUpdateInventoryItem).not.toHaveBeenCalled();
  });

  it('clears a field error when the user corrects that field', async () => {
    renderDetail();
    await userEvent.clear(screen.getByLabelText(/Product Name/));
    await userEvent.click(screen.getByTestId('save-button'));
    expect(screen.getByText('Product name is required.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Product Name/), 'Fixed Name');
    expect(screen.queryByText('Product name is required.')).not.toBeInTheDocument();
  });

  it('shows quantity validation error for negative values', async () => {
    renderDetail();
    await userEvent.clear(screen.getByLabelText(/Quantity/));
    await userEvent.type(screen.getByLabelText(/Quantity/), '-5');
    await userEvent.click(screen.getByTestId('save-button'));
    expect(screen.getByText('Quantity must be non-negative.')).toBeInTheDocument();
  });
});

describe('ItemDetailView — save functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('successful save calls onItemUpdated then onClose to dismiss the view', async () => {
    const updatedItem: InventoryItem = {
      ...baseItem,
      name: 'Updated Milk',
      updatedAt: '2025-01-15T10:00:00Z',
    };
    mockUpdateInventoryItem.mockResolvedValueOnce({ item: updatedItem });

    renderDetail();
    await userEvent.clear(screen.getByLabelText(/Product Name/));
    await userEvent.type(screen.getByLabelText(/Product Name/), 'Updated Milk');
    await userEvent.click(screen.getByTestId('save-button'));

    await waitFor(() => {
      expect(onItemUpdated).toHaveBeenCalledWith(updatedItem, undefined, undefined);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('API error shows error banner', async () => {
    mockUpdateInventoryItem.mockRejectedValueOnce(new Error('Item not found'));

    renderDetail();
    await userEvent.click(screen.getByTestId('save-button'));

    await waitFor(() => {
      expect(screen.getByText('Item not found')).toBeInTheDocument();
    });
    // Form should still be visible
    expect(screen.getByTestId('save-button')).toBeInTheDocument();
  });

  it('network error shows network error message', async () => {
    mockUpdateInventoryItem.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderDetail();
    await userEvent.click(screen.getByTestId('save-button'));

    await waitFor(() => {
      expect(
        screen.getByText('Network error — please check your connection and try again'),
      ).toBeInTheDocument();
    });
  });

  it('Save and Cancel buttons are disabled during save', async () => {
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockUpdateInventoryItem.mockReturnValueOnce(pendingPromise as never);

    renderDetail();
    await userEvent.click(screen.getByTestId('save-button'));

    expect(screen.getByTestId('save-button')).toBeDisabled();
    expect(screen.getByTestId('cancel-button')).toBeDisabled();
    expect(screen.getByTestId('save-button')).toHaveTextContent('Saving…');

    resolvePromise!({ item: baseItem });
    await waitFor(() => {
      expect(screen.getByTestId('save-button')).not.toBeDisabled();
    });
  });

  it('sends correct data to updateInventoryItem', async () => {
    mockUpdateInventoryItem.mockResolvedValueOnce({ item: baseItem });

    renderDetail();
    await userEvent.click(screen.getByTestId('save-button'));

    await waitFor(() => {
      expect(mockUpdateInventoryItem).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateInventoryItem).toHaveBeenCalledWith('item-1', {
      name: 'Organic Milk',
      category: 'Dairy',
      locationId: 'loc-2',
      quantity: 3,
      unit: 'Liter',
      expirationDate: '2025-02-15',
    });
  });

  it('includes optional fields in API call when non-empty', async () => {
    const fullItem: InventoryItem = {
      ...baseItem,
      brand: 'Horizon',
      barcode: '123456789',
      whereToBuy: 'Whole Foods',
      onlineStoreLink: 'https://example.com/buy',
      threshold: 2,
    };
    mockUpdateInventoryItem.mockResolvedValueOnce({ item: fullItem });

    renderDetail(fullItem);
    await userEvent.click(screen.getByTestId('save-button'));

    await waitFor(() => {
      expect(mockUpdateInventoryItem).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateInventoryItem).toHaveBeenCalledWith('item-1', {
      name: 'Organic Milk',
      category: 'Dairy',
      locationId: 'loc-2',
      quantity: 3,
      unit: 'Liter',
      expirationDate: '2025-02-15',
      brand: 'Horizon',
      barcode: '123456789',
      whereToBuy: 'Whole Foods',
      onlineStoreLink: 'https://example.com/buy',
      threshold: 2,
    });
  });
});
