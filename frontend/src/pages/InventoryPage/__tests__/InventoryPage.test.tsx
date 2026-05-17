import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import InventoryPage, {
  BarcodeScannerErrorBoundary,
  BarcodeScannerLoadingFallback,
} from '../InventoryPage';
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

// Mock BarcodeScanner so Quagga is never loaded in jsdom
jest.mock('../../../components/BarcodeScanner/BarcodeScanner', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => <div data-testid="barcode-scanner-mock" />),
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
    const result = await act(async () =>
      capturedOnSubmit!({
        name: 'Eggs',
        category: 'Dairy',
        expirationDate: '2025-12-01',
        locationId: 'loc-1',
        quantity: 12,
        unit: 'Unit',
      }),
    );

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
    await act(async () => {
      await capturedOnSubmit!({
        name: 'Butter',
        category: 'Dairy',
        expirationDate: '2025-12-01',
        locationId: 'loc-1',
        quantity: 1,
        unit: 'Unit',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Butter is running low on stock')).toBeInTheDocument();
    });
  });
});

describe('BarcodeScanner lazy loading', () => {
  // These tests exercise BarcodeScannerLoadingFallback and BarcodeScannerErrorBoundary
  // directly with a controlled React.lazy, avoiding the multiple-React-copies problem
  // that arises from jest.isolateModules.
  //
  // We import the exported components from InventoryPage and build a minimal harness:
  //   <BarcodeScannerErrorBoundary onClose onRetry>
  //     <Suspense fallback={<BarcodeScannerLoadingFallback />}>
  //       <LazyComponent />
  //     </Suspense>
  //   </BarcodeScannerErrorBoundary>

  it('shows loading fallback while scanner chunk is loading', async () => {
    let resolveImport!: (mod: { default: React.ComponentType }) => void;
    const deferredImport = new Promise<{ default: React.ComponentType }>((resolve) => {
      resolveImport = resolve;
    });

    const LazyScanner = React.lazy(() => deferredImport);
    const onClose = jest.fn();
    const onRetry = jest.fn();

    render(
      <BarcodeScannerErrorBoundary onClose={onClose} onRetry={onRetry}>
        <React.Suspense fallback={<BarcodeScannerLoadingFallback />}>
          <LazyScanner />
        </React.Suspense>
      </BarcodeScannerErrorBoundary>,
    );

    // Loading fallback should be visible while the import is pending
    expect(screen.getByTestId('barcode-scanner-loading')).toBeInTheDocument();

    // Resolve the import
    act(() => {
      resolveImport({ default: () => <div data-testid="barcode-scanner-mock" /> });
    });

    // Scanner mock should appear and loading fallback should disappear
    await screen.findByTestId('barcode-scanner-mock');
    expect(screen.queryByTestId('barcode-scanner-loading')).not.toBeInTheDocument();
  });

  it('does not show loading fallback on second scanner open (module cached)', async () => {
    const user = userEvent.setup();
    setupDefaults();

    // The module-level mock resolves synchronously (simulating cached module).
    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Add item')).toBeInTheDocument();
    });

    // First open
    await user.click(screen.getByLabelText('Add item'));
    await user.click(screen.getByRole('menuitem', { name: /Barcode Scan/i }));
    await screen.findByTestId('barcode-scanner-mock');
    expect(screen.queryByTestId('barcode-scanner-loading')).not.toBeInTheDocument();

    // Close scanner by invoking the onClose prop on the mock
    const { default: BarcodeScanner } = await import('../../../components/BarcodeScanner/BarcodeScanner');
    const mockCalls = (BarcodeScanner as jest.Mock).mock.calls;
    const lastCallProps = mockCalls[mockCalls.length - 1][0];
    act(() => lastCallProps.onClose());

    // Second open
    await user.click(screen.getByLabelText('Add item'));
    await user.click(screen.getByRole('menuitem', { name: /Barcode Scan/i }));

    // Loading fallback should NOT appear (module already cached)
    expect(screen.queryByTestId('barcode-scanner-loading')).not.toBeInTheDocument();
    await screen.findByTestId('barcode-scanner-mock');
  });

  it('shows error boundary overlay when scanner chunk fails to load', async () => {
    const rejectedImport = Promise.reject(new Error('Loading chunk failed'));
    // Prevent unhandled rejection warning
    rejectedImport.catch(() => {});

    const LazyScanner = React.lazy(() => rejectedImport);
    const onClose = jest.fn();
    const onRetry = jest.fn();

    // Suppress React's error boundary console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <BarcodeScannerErrorBoundary onClose={onClose} onRetry={onRetry}>
        <React.Suspense fallback={<BarcodeScannerLoadingFallback />}>
          <LazyScanner />
        </React.Suspense>
      </BarcodeScannerErrorBoundary>,
    );

    // Error boundary should catch the failed import
    await screen.findByTestId('barcode-scanner-error');
    expect(screen.getByText("Couldn't load the scanner.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    // Click Close — onClose callback should be invoked
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('shows error boundary overlay and inventory UI remains when scanner fails (integration)', async () => {
    const user = userEvent.setup();
    setupDefaults();

    // Override the module-level mock to reject for this test
    const { default: BarcodeScanner } = await import('../../../components/BarcodeScanner/BarcodeScanner');
    (BarcodeScanner as jest.Mock).mockImplementation(() => {
      throw new Error('Loading chunk failed');
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Add item')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Add item'));
    await user.click(screen.getByRole('menuitem', { name: /Barcode Scan/i }));

    // Error boundary should catch the render error
    await screen.findByTestId('barcode-scanner-error');
    expect(screen.getByText("Couldn't load the scanner.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    // Click Close — error overlay should unmount and inventory UI should remain
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('barcode-scanner-error')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Add item')).toBeInTheDocument();

    // Restore mock to normal behavior
    (BarcodeScanner as jest.Mock).mockImplementation(() => <div data-testid="barcode-scanner-mock" />);
    consoleSpy.mockRestore();
  });

  it('retries loading the scanner chunk after a failure', async () => {
    let resolveSecondImport!: (mod: { default: React.ComponentType }) => void;
    const secondImportPromise = new Promise<{ default: React.ComponentType }>((resolve) => {
      resolveSecondImport = resolve;
    });

    // First lazy component always rejects
    const LazyFirst = React.lazy(() => Promise.reject(new Error('Loading chunk failed')));
    // Second lazy component resolves with the mock
    const LazySecond = React.lazy(() => secondImportPromise);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Stateful wrapper: starts with LazyFirst, switches to LazySecond on retry
    const TestHarness: React.FC = () => {
      const [retried, setRetried] = React.useState(false);
      const LazyComponent = retried ? LazySecond : LazyFirst;
      return (
        <BarcodeScannerErrorBoundary
          onClose={jest.fn()}
          onRetry={() => setRetried(true)}
        >
          <React.Suspense fallback={<BarcodeScannerLoadingFallback />}>
            <LazyComponent />
          </React.Suspense>
        </BarcodeScannerErrorBoundary>
      );
    };

    render(<TestHarness />);

    // Error boundary shows after first failure
    await screen.findByTestId('barcode-scanner-error');

    // Click Retry — this calls onRetry which switches to LazySecond
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    // Resolve the second import
    act(() => {
      resolveSecondImport({ default: () => <div data-testid="barcode-scanner-mock" /> });
    });

    // Scanner should eventually appear
    await screen.findByTestId('barcode-scanner-mock');
    expect(screen.queryByTestId('barcode-scanner-error')).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
