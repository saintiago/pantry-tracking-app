import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import InventoryPage from '../InventoryPage';
import type { StorageLocation } from '../../../api/locations/locations';
import type { InventoryItem } from '../../../components/InventoryList/InventoryList';
import type { PageId } from '../../../components/Layout/Layout';
import type { AddItemData } from '../../AddItemPage/AddItemPage';

// Mock the location API module
jest.mock('../../../api/locations/locations', () => ({
  fetchLocations: jest.fn(),
  createLocation: jest.fn(),
  renameLocation: jest.fn(),
  deleteLocation: jest.fn(),
}));

// Mock the inventory API module
jest.mock('../../../api/inventory/inventory', () => ({
  fetchInventory: jest.fn(),
  addInventoryItem: jest.fn(),
  deleteInventoryItem: jest.fn(),
}));

import {
  fetchLocations,
  createLocation,
  renameLocation,
  deleteLocation,
} from '../../../api/locations/locations';

import {
  fetchInventory,
  addInventoryItem,
  deleteInventoryItem,
} from '../../../api/inventory/inventory';

const mockFetchLocations = fetchLocations as jest.MockedFunction<typeof fetchLocations>;
const mockCreateLocation = createLocation as jest.MockedFunction<typeof createLocation>;
const mockRenameLocation = renameLocation as jest.MockedFunction<typeof renameLocation>;
const mockDeleteLocation = deleteLocation as jest.MockedFunction<typeof deleteLocation>;
const mockFetchInventory = fetchInventory as jest.MockedFunction<typeof fetchInventory>;
const mockAddInventoryItem = addInventoryItem as jest.MockedFunction<typeof addInventoryItem>;
const mockDeleteInventoryItem = deleteInventoryItem as jest.MockedFunction<
  typeof deleteInventoryItem
>;

const defaultLocations = [
  { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
];

const defaultItems = [
  {
    itemId: 'item-1',
    name: 'Milk',
    category: 'Dairy',
    expirationDate: '2025-06-01',
    location: 'loc-1',
    quantity: 2,
    unit: 'liters',
    isLowStock: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

beforeEach(() => {
  jest.resetAllMocks();
});

function setupDefaults() {
  mockFetchLocations.mockResolvedValue(defaultLocations);
  mockFetchInventory.mockResolvedValue({ items: defaultItems });
}

// Default no-op props for InventoryPage
const noop = () => {};
const defaultProps = {
  onNavigate: noop as (page: PageId) => void,
  onNavigateToAddItem: noop as (
    locations: StorageLocation[],
    onSubmit: (item: AddItemData) => Promise<{ error?: string }>,
    prefillData?: { name?: string; brand?: string; category?: string; barcode?: string },
  ) => void,
  onNavigateToItemDetail: noop as (
    item: InventoryItem,
    locations: StorageLocation[],
    onItemUpdated: (
      updatedItem: InventoryItem,
      lowStockTransition?: boolean,
      notification?: { type: string; message: string; itemId: string },
    ) => void,
  ) => void,
};

function renderInventoryPage(overrides?: Partial<typeof defaultProps>) {
  return render(<InventoryPage {...defaultProps} {...overrides} />);
}

describe('InventoryPage', () => {
  it('shows loading state then renders inventory and locations', async () => {
    setupDefaults();

    renderInventoryPage();

    expect(screen.getByText('Loading…')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('category-card-Dairy')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Delete Pantry')).toBeInTheDocument();
  });

  it('shows error state with retry button on fetch failure', async () => {
    mockFetchLocations.mockRejectedValueOnce(new Error('Network error'));
    mockFetchInventory.mockResolvedValue({ items: [] });

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();

    setupDefaults();
    await userEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByLabelText('Delete Pantry')).toBeInTheDocument();
    });
  });

  it('adds a location and refreshes the list', async () => {
    setupDefaults();
    mockFetchLocations
      .mockResolvedValueOnce(defaultLocations)
      .mockResolvedValueOnce([
        ...defaultLocations,
        { locationId: 'loc-2', name: 'Fridge', createdAt: '2024-01-02T00:00:00Z' },
      ]);

    mockCreateLocation.mockResolvedValue({
      locationId: 'loc-2',
      name: 'Fridge',
      createdAt: '2024-01-02T00:00:00Z',
    });

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Add item')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('New location name');
    await userEvent.type(input, 'Fridge');
    await userEvent.click(screen.getByLabelText('Add location'));

    expect(mockCreateLocation).toHaveBeenCalledWith('Fridge');

    await waitFor(() => {
      expect(screen.getByLabelText('Delete Fridge')).toBeInTheDocument();
    });
  });

  it('shows error from API when add fails with duplicate name', async () => {
    setupDefaults();

    mockCreateLocation.mockRejectedValue(
      new Error('A storage location with this name already exists'),
    );

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Add item')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('New location name');
    await userEvent.type(input, 'NewPlace');
    await userEvent.click(screen.getByLabelText('Add location'));

    await waitFor(() => {
      expect(
        screen.getByText('A storage location with this name already exists'),
      ).toBeInTheDocument();
    });
  });

  it('renames a location and refreshes the list', async () => {
    setupDefaults();
    mockFetchLocations
      .mockResolvedValueOnce(defaultLocations)
      .mockResolvedValueOnce([
        { locationId: 'loc-1', name: 'Kitchen', createdAt: '2024-01-01T00:00:00Z' },
      ]);

    mockRenameLocation.mockResolvedValue({
      locationId: 'loc-1',
      name: 'Kitchen',
      createdAt: '2024-01-01T00:00:00Z',
    });

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Rename Pantry')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Rename Pantry'));

    const renameInput = screen.getByLabelText('Rename Pantry');
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, 'Kitchen');
    await userEvent.click(screen.getByLabelText('Save rename'));

    expect(mockRenameLocation).toHaveBeenCalledWith('loc-1', 'Kitchen');

    await waitFor(() => {
      expect(screen.getByLabelText('Rename Kitchen')).toBeInTheDocument();
    });
  });

  it('removes a location after confirmation and refreshes the list', async () => {
    mockFetchInventory.mockResolvedValue({ items: defaultItems });
    mockFetchLocations
      .mockResolvedValueOnce([
        ...defaultLocations,
        { locationId: 'loc-2', name: 'Fridge', createdAt: '2024-01-02T00:00:00Z' },
      ])
      .mockResolvedValueOnce(defaultLocations);

    mockDeleteLocation.mockResolvedValue(undefined);

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Delete Fridge')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Delete Fridge'));
    await userEvent.click(screen.getByLabelText('Confirm delete Fridge'));

    expect(mockDeleteLocation).toHaveBeenCalledWith('loc-2');

    await waitFor(() => {
      expect(screen.queryByLabelText('Delete Fridge')).not.toBeInTheDocument();
    });
  });

  it('shows error when removing last location', async () => {
    setupDefaults();

    mockDeleteLocation.mockRejectedValue(
      new Error('Cannot remove the last remaining storage location'),
    );

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Delete Pantry')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Delete Pantry'));
    await userEvent.click(screen.getByLabelText('Confirm delete Pantry'));

    await waitFor(() => {
      expect(
        screen.getByText('Cannot remove the last remaining storage location'),
      ).toBeInTheDocument();
    });
  });
});

describe('MainScreen Add/Remove buttons', () => {
  beforeEach(() => {
    setupDefaults();
  });

  it('renders Add and Remove buttons with minimum 44x44px tap targets', async () => {
    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Add item')).toBeInTheDocument();
    });

    const addBtn = screen.getByLabelText('Add item');
    const removeBtn = screen.getByLabelText('Remove item');

    expect(addBtn).toBeInTheDocument();
    expect(removeBtn).toBeInTheDocument();

    expect(addBtn.style.minHeight).toBe('56px');
    expect(addBtn.style.minWidth).toBe('44px');
    expect(removeBtn.style.minHeight).toBe('56px');
    expect(removeBtn.style.minWidth).toBe('44px');
  });

  it('opens add menu with entry methods when Add button is clicked', async () => {
    const user = userEvent.setup();
    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Add item')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Add item'));

    expect(screen.getByRole('menu', { name: 'Add item methods' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Manual Entry/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Barcode Scan/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Receipt Photo/i })).toBeInTheDocument();
  });

  it('closes add menu when a method is selected', async () => {
    const user = userEvent.setup();
    const onNavigateToAddItem = jest.fn();
    renderInventoryPage({ onNavigateToAddItem });

    await waitFor(() => {
      expect(screen.getByLabelText('Add item')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Add item'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: /Manual Entry/i }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // Navigation callback should have been called
    expect(onNavigateToAddItem).toHaveBeenCalled();
  });

  it('toggles add menu open and closed', async () => {
    const user = userEvent.setup();
    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Add item')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Add item'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Add item'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('toggles remove mode and shows hint text', async () => {
    const user = userEvent.setup();
    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Remove item')).toBeInTheDocument();
    });

    const removeBtn = screen.getByLabelText('Remove item');
    expect(removeBtn).toHaveAttribute('aria-pressed', 'false');

    await user.click(removeBtn);
    expect(removeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Tap an item to remove it/i)).toBeInTheDocument();

    await user.click(removeBtn);
    expect(removeBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Tap an item to remove it/i)).not.toBeInTheDocument();
  });

  it('Add button has aria-expanded and aria-haspopup attributes', async () => {
    const user = userEvent.setup();
    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Add item')).toBeInTheDocument();
    });

    const addBtn = screen.getByLabelText('Add item');
    expect(addBtn).toHaveAttribute('aria-expanded', 'false');
    expect(addBtn).toHaveAttribute('aria-haspopup', 'menu');

    await user.click(addBtn);
    expect(addBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('each add menu item has minimum 48px height for touch targets', async () => {
    const user = userEvent.setup();
    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Add item')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Add item'));

    const menuItems = screen.getAllByRole('menuitem');
    menuItems.forEach((item) => {
      expect(item.style.minHeight).toBe('48px');
    });
  });
});

describe('Inventory integration', () => {
  beforeEach(() => {
    setupDefaults();
  });

  it('loads and displays inventory items on mount', async () => {
    const user = userEvent.setup();
    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByTestId('category-card-Dairy')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('category-card-Dairy'));
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(mockFetchInventory).toHaveBeenCalled();
  });

  it('opens AddItemModal when Manual Entry is selected', async () => {
    const user = userEvent.setup();
    const onNavigateToAddItem = jest.fn();
    renderInventoryPage({ onNavigateToAddItem });

    await waitFor(() => {
      expect(screen.getByLabelText('Add item')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Add item'));
    await user.click(screen.getByRole('menuitem', { name: /Manual Entry/i }));

    // Navigation to AddItemPage should be triggered (no dialog rendered inline)
    expect(onNavigateToAddItem).toHaveBeenCalledWith(
      expect.any(Array), // locations
      expect.any(Function), // onSubmit
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls addInventoryItem API when submitting an item and reloads', async () => {
    const user = userEvent.setup();
    mockAddInventoryItem.mockResolvedValue({
      item: { ...defaultItems[0], itemId: 'item-2', name: 'Eggs' },
    });
    mockFetchInventory
      .mockResolvedValueOnce({ items: defaultItems })
      .mockResolvedValueOnce({
        items: [...defaultItems, { ...defaultItems[0], itemId: 'item-2', name: 'Eggs' }],
      });

    let capturedOnSubmit: ((item: AddItemData) => Promise<{ error?: string }>) | undefined;
    const onNavigateToAddItem = jest.fn((_locations, onSubmit) => {
      capturedOnSubmit = onSubmit;
    });

    renderInventoryPage({ onNavigateToAddItem });

    await waitFor(() => {
      expect(screen.getByTestId('category-card-Dairy')).toBeInTheDocument();
    });

    // Trigger navigation to AddItemPage
    await user.click(screen.getByLabelText('Add item'));
    await user.click(screen.getByRole('menuitem', { name: /Manual Entry/i }));

    expect(onNavigateToAddItem).toHaveBeenCalled();
    expect(capturedOnSubmit).toBeDefined();

    // Invoke the onSubmit callback directly (simulating AddItemPage form submission)
    const result = await capturedOnSubmit!({
      name: 'Eggs',
      category: 'Dairy',
      expirationDate: '2025-12-01',
      locationId: 'loc-1',
      quantity: 12,
      unit: 'Unit',
    });

    expect(result).toEqual({});
    await waitFor(() => {
      expect(mockAddInventoryItem).toHaveBeenCalled();
    });
  });

  it('removes an item via deleteInventoryItem API and reloads', async () => {
    const user = userEvent.setup();
    mockDeleteInventoryItem.mockResolvedValue(undefined);
    mockFetchInventory
      .mockResolvedValueOnce({ items: defaultItems })
      .mockResolvedValueOnce({ items: [] });

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByTestId('category-card-Dairy')).toBeInTheDocument();
    });

    // Enter remove mode
    await user.click(screen.getByLabelText('Remove item'));
    expect(screen.getByLabelText('Remove item')).toHaveAttribute('aria-pressed', 'true');

    // Drill into Dairy to see items with remove buttons
    await user.click(screen.getByTestId('category-card-Dairy'));

    // Click remove on the item
    await user.click(screen.getByLabelText('Remove Milk'));

    await waitFor(() => {
      expect(mockDeleteInventoryItem).toHaveBeenCalledWith('item-1');
    });
  });

  it('shows low-stock notification when addInventoryItem returns lowStockTransition', async () => {
    const user = userEvent.setup();
    mockAddInventoryItem.mockResolvedValue({
      item: { ...defaultItems[0], itemId: 'item-2', name: 'Butter', isLowStock: true },
      lowStockTransition: true,
      notification: { type: 'LOW_STOCK', message: 'Butter is running low on stock', itemId: 'item-2' },
    });
    mockFetchInventory
      .mockResolvedValueOnce({ items: defaultItems })
      .mockResolvedValueOnce({ items: defaultItems });

    let capturedOnSubmit: ((item: AddItemData) => Promise<{ error?: string }>) | undefined;
    const onNavigateToAddItem = jest.fn((_locations, onSubmit) => {
      capturedOnSubmit = onSubmit;
    });

    renderInventoryPage({ onNavigateToAddItem });

    await waitFor(() => {
      expect(screen.getByTestId('category-card-Dairy')).toBeInTheDocument();
    });

    // Trigger navigation to AddItemPage
    await user.click(screen.getByLabelText('Add item'));
    await user.click(screen.getByRole('menuitem', { name: /Manual Entry/i }));

    expect(capturedOnSubmit).toBeDefined();

    // Invoke the onSubmit callback directly
    await capturedOnSubmit!({
      name: 'Butter',
      category: 'Dairy',
      expirationDate: '2025-12-01',
      locationId: 'loc-1',
      quantity: 1,
      unit: 'Unit',
    });

    await waitFor(() => {
      expect(screen.getByText('Butter is running low on stock')).toBeInTheDocument();
    });
  });
});
