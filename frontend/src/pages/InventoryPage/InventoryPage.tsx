import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import '../../styles/inventory-theme.css';
import StorageLocationManager from '../../components/StorageLocationManager/StorageLocationManager';
import InventoryList from '../../components/InventoryList/InventoryList';
import { InAppNotification } from '../../components/InventoryList/InventoryList';
// Type-only import — erased at compile time, does not pull in Quagga
import type { BarcodeLookupResult } from '../../components/BarcodeScanner/BarcodeScanner';

// Lazy value import — Vite emits a separate chunk
const BarcodeScanner = lazy(() => import('../../components/BarcodeScanner/BarcodeScanner'));
import type { AddItemData } from '../AddItemPage/AddItemPage';
import type { StorageLocation } from '../../api/locations/locations';
import type { InventoryItem } from '../../components/InventoryList/InventoryList';
import type { PageId } from '../../components/Layout/Layout';
import {
  fetchLocations,
  createLocation,
  renameLocation,
  deleteLocation,
} from '../../api/locations/locations';
import {
  fetchInventory,
  addInventoryItem,
  deleteInventoryItem,
} from '../../api/inventory/inventory';

// --- Barcode Scanner Loading Fallback ---

export const BarcodeScannerLoadingFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading barcode scanner"
    data-testid="barcode-scanner-loading"
    style={styles.scannerLoadingOverlay}
  >
    <div style={styles.scannerLoadingModal}>
      <div style={styles.scannerLoadingSpinner} aria-hidden="true" />
      <p style={styles.scannerLoadingText}>Loading scanner…</p>
    </div>
  </div>
);

// --- Barcode Scanner Error Boundary ---

interface BarcodeScannerErrorBoundaryProps {
  onClose: () => void;
  onRetry: () => void;
  children: React.ReactNode;
}

interface BarcodeScannerErrorBoundaryState {
  error: Error | null;
}

export class BarcodeScannerErrorBoundary extends React.Component<
  BarcodeScannerErrorBoundaryProps,
  BarcodeScannerErrorBoundaryState
> {
  state: BarcodeScannerErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BarcodeScannerErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Error is captured in state via getDerivedStateFromError; info available for logging
    void error;
    void info;
  }

  render() {
    if (this.state.error) {
      return (
        <div
          data-testid="barcode-scanner-error"
          style={styles.scannerErrorOverlay}
        >
          <div style={styles.scannerErrorModal}>
            <p style={styles.scannerErrorText}>Couldn't load the scanner.</p>
            <div style={styles.scannerErrorButtons}>
              <button
                style={styles.scannerErrorRetryButton}
                onClick={() => {
                  this.setState({ error: null });
                  this.props.onRetry();
                }}
                type="button"
              >
                Retry
              </button>
              <button
                style={styles.scannerErrorCloseButton}
                onClick={this.props.onClose}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- InventoryPage ---

interface InventoryPageProps {
  onNavigate: (page: PageId) => void;
  onNavigateToAddItem: (
    locations: StorageLocation[],
    onSubmit: (item: AddItemData) => Promise<{ error?: string }>,
    prefillData?: { name?: string; brand?: string; category?: string; barcode?: string },
  ) => void;
  onNavigateToItemDetail: (
    item: InventoryItem,
    locations: StorageLocation[],
    onItemUpdated: (
      updatedItem: InventoryItem,
      lowStockTransition?: boolean,
      notification?: { type: string; message: string; itemId: string },
    ) => void,
  ) => void;
}

const InventoryPage: React.FC<InventoryPageProps> = ({ onNavigate: _onNavigate, onNavigateToAddItem, onNavigateToItemDetail }) => {
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [notification, setNotification] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });
  const [scannerOpen, setScannerOpen] = useState(false);

  const loadLocations = useCallback(async () => {
    const data = await fetchLocations();
    setLocations(data);
  }, []);

  const loadInventory = useCallback(async () => {
    const data = await fetchInventory();
    setInventoryItems(data.items);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      await Promise.all([loadLocations(), loadInventory()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [loadLocations, loadInventory]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleAddLocation = useCallback(
    async (name: string): Promise<{ error?: string }> => {
      try {
        await createLocation(name);
        await loadLocations();
        return {};
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add location';
        return { error: message };
      }
    },
    [loadLocations],
  );

  const handleRename = useCallback(
    async (locationId: string, newName: string): Promise<{ error?: string }> => {
      try {
        await renameLocation(locationId, newName);
        await loadLocations();
        return {};
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to rename location';
        return { error: message };
      }
    },
    [loadLocations],
  );

  const handleRemoveLocation = useCallback(
    async (locationId: string): Promise<{ error?: string }> => {
      try {
        await deleteLocation(locationId);
        await loadLocations();
        return {};
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove location';
        return { error: message };
      }
    },
    [loadLocations],
  );

  const handleAddItem = useCallback(
    async (data: AddItemData): Promise<{ error?: string }> => {
      try {
        const result = await addInventoryItem(data as unknown as Record<string, unknown>);
        if (result.lowStockTransition && result.notification) {
          setNotification({ message: result.notification.message, visible: true });
        }
        await loadInventory();
        return {};
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add item';
        return { error: message };
      }
    },
    [loadInventory],
  );

  const handleAddMenuSelect = useCallback((method: 'manual' | 'barcode' | 'receipt') => {
    setAddMenuOpen(false);
    if (method === 'manual') {
      onNavigateToAddItem(locations, handleAddItem);
    } else if (method === 'barcode') {
      setScannerOpen(true);
    }
    // Future tasks will wire receipt
  }, [locations, onNavigateToAddItem, handleAddItem]);

  const handleBarcodeDetected = useCallback((result: BarcodeLookupResult) => {
    setScannerOpen(false);
    onNavigateToAddItem(locations, handleAddItem, {
      barcode: result.barcode,
      name: result.product?.name,
      brand: result.product?.brand,
      category: result.product?.category,
    });
  }, [locations, onNavigateToAddItem, handleAddItem]);

  const handleRemoveItem = useCallback(
    async (itemId: string) => {
      try {
        await deleteInventoryItem(itemId);
        const data = await fetchInventory();
        setInventoryItems(data.items);
        if (data.items.length === 0) {
          setRemoveMode(false);
        }
      } catch {
        // Silently handle — could add error toast in future
      }
    },
    [],
  );

  const handleItemUpdated = useCallback((updatedItem: InventoryItem, lowStockTransition?: boolean, notificationData?: { type: string; message: string; itemId: string }) => {
    setInventoryItems((prev) =>
      prev.map((i) => (i.itemId === updatedItem.itemId ? updatedItem : i)),
    );
    if (lowStockTransition && notificationData) {
      setNotification({ message: notificationData.message, visible: true });
    }
  }, []);

  const handleItemClick = useCallback((item: InventoryItem) => {
    onNavigateToItemDetail(item, locations, handleItemUpdated);
  }, [locations, onNavigateToItemDetail, handleItemUpdated]);

  const toggleRemoveMode = useCallback(() => {
    setRemoveMode((prev) => !prev);
  }, []);

  if (loading) {
    return (
      <div style={styles.centered} role="status" aria-label="Loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centered} role="alert">
        <p style={styles.errorText}>{error}</p>
        <button onClick={loadAll} style={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="page inventory-page">
      <h2>Inventory</h2>

      <InAppNotification
        message={notification.message}
        visible={notification.visible}
        onDismiss={() => setNotification((prev) => ({ ...prev, visible: false }))}
      />

      {/* Main action buttons */}
      <div style={styles.actionRow}>
        <div style={styles.addButtonWrapper}>
          <button
            onClick={() => setAddMenuOpen((prev) => !prev)}
            style={styles.addButton}
            aria-label="Add item"
            aria-expanded={addMenuOpen}
            aria-haspopup="menu"
          >
            <span style={styles.buttonIcon} aria-hidden="true">+</span>
            <span>Add</span>
          </button>
          {addMenuOpen && (
            <div style={styles.addMenu} role="menu" aria-label="Add item methods">
              <button
                role="menuitem"
                style={styles.menuItem}
                onClick={() => handleAddMenuSelect('manual')}
              >
                ✏️ Manual Entry
              </button>
              <button
                role="menuitem"
                style={styles.menuItem}
                onClick={() => handleAddMenuSelect('barcode')}
              >
                📷 Barcode Scan
              </button>
              <button
                role="menuitem"
                style={styles.menuItem}
                onClick={() => handleAddMenuSelect('receipt')}
              >
                🧾 Receipt Photo
              </button>
            </div>
          )}
        </div>

        <button
          onClick={toggleRemoveMode}
          style={{
            ...styles.removeButton,
            ...(removeMode ? styles.removeButtonActive : {}),
          }}
          aria-label="Remove item"
          aria-pressed={removeMode}
        >
          <span style={styles.buttonIcon} aria-hidden="true">−</span>
          <span>Remove</span>
        </button>
      </div>

      {removeMode && (
        <p style={styles.removeModeHint} role="status">
          Tap an item to remove it. Press Remove again to exit.
        </p>
      )}

      <InventoryList
        items={inventoryItems}
        locations={locations}
        removeMode={removeMode}
        onRemoveItem={handleRemoveItem}
        onItemClick={handleItemClick}
      />

      <StorageLocationManager
        locations={locations}
        onAdd={handleAddLocation}
        onRename={handleRename}
        onRemove={handleRemoveLocation}
      />

      {scannerOpen && (
        <BarcodeScannerErrorBoundary
          onClose={() => setScannerOpen(false)}
          onRetry={() => {
            setScannerOpen(false);
            setTimeout(() => setScannerOpen(true), 0);
          }}
        >
          <Suspense fallback={<BarcodeScannerLoadingFallback />}>
            <BarcodeScanner
              isOpen={scannerOpen}
              onClose={() => setScannerOpen(false)}
              onBarcodeDetected={handleBarcodeDetected}
            />
          </Suspense>
        </BarcodeScannerErrorBoundary>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '1rem',
    marginBottom: '0.75rem',
  },
  retryButton: {
    minWidth: 44,
    minHeight: 44,
    padding: '0.5rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: 'var(--inv-primary)',
    border: 'none',
    borderRadius: 'var(--inv-radius-md)' as unknown as number,
    cursor: 'pointer',
    boxShadow: 'var(--inv-shadow-sm)',
  },
  actionRow: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1rem',
  },
  addButtonWrapper: {
    position: 'relative' as const,
    flex: 1,
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    width: '100%',
    minHeight: 56,
    minWidth: 44,
    padding: '0.75rem 1rem',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: '#ffffff',
    backgroundColor: 'var(--inv-sage)',
    border: 'none',
    borderRadius: 'var(--inv-radius-lg)' as unknown as number,
    cursor: 'pointer',
    boxShadow: 'var(--inv-shadow-sm)',
  },
  removeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    flex: 1,
    minHeight: 56,
    minWidth: 44,
    padding: '0.75rem 1rem',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: '#ffffff',
    backgroundColor: 'var(--inv-primary)',
    border: 'none',
    borderRadius: 'var(--inv-radius-lg)' as unknown as number,
    cursor: 'pointer',
    boxShadow: 'var(--inv-shadow-sm)',
  },
  removeButtonActive: {
    backgroundColor: 'var(--inv-primary-dark)',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)',
  },
  buttonIcon: {
    fontSize: '1.5rem',
    lineHeight: 1,
    fontWeight: 700,
  },
  addMenu: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: 'var(--inv-warm-white)',
    border: '1px solid var(--inv-border)',
    borderRadius: 'var(--inv-radius-md)' as unknown as number,
    boxShadow: 'var(--inv-shadow-md)',
    zIndex: 20,
    overflow: 'hidden',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    minHeight: 48,
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    color: 'var(--inv-text)',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '1px solid var(--inv-border)',
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  removeModeHint: {
    fontSize: '0.875rem',
    color: 'var(--inv-amber)',
    marginBottom: '0.75rem',
    fontStyle: 'italic',
  },
  // BarcodeScannerLoadingFallback styles
  scannerLoadingOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
  },
  scannerLoadingModal: {
    backgroundColor: 'var(--inv-warm-white)',
    borderRadius: 'var(--inv-radius-md)' as unknown as number,
    width: '100%',
    maxWidth: 480,
    padding: '2rem 1.25rem',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
  },
  scannerLoadingSpinner: {
    width: 40,
    height: 40,
    border: '4px solid #e5e7eb',
    borderTopColor: 'var(--inv-primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  scannerLoadingText: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#374151',
    margin: 0,
  },
  // BarcodeScannerErrorBoundary styles
  scannerErrorOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
  },
  scannerErrorModal: {
    backgroundColor: 'var(--inv-warm-white)',
    borderRadius: 'var(--inv-radius-md)' as unknown as number,
    width: '100%',
    maxWidth: 480,
    padding: '2rem 1.25rem',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
  },
  scannerErrorText: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#374151',
    margin: 0,
    textAlign: 'center',
  },
  scannerErrorButtons: {
    display: 'flex',
    gap: '0.75rem',
  },
  scannerErrorRetryButton: {
    minHeight: 44,
    minWidth: 44,
    padding: '0.625rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: 'var(--inv-sage)',
    border: 'none',
    borderRadius: 'var(--inv-radius-md)' as unknown as number,
    cursor: 'pointer',
  },
  scannerErrorCloseButton: {
    minHeight: 44,
    minWidth: 44,
    padding: '0.625rem 1.25rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
  },
};

export default InventoryPage;
