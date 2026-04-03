import React, { useCallback, useEffect, useState } from 'react';
import StorageLocationManager from '../components/StorageLocationManager';
import InventoryList from '../components/InventoryList';
import { InAppNotification } from '../components/InventoryList';
import AddItemModal from '../components/AddItemModal';
import ItemDetailView from '../components/ItemDetailView';
import BarcodeScanner from '../components/BarcodeScanner';
import type { BarcodeLookupResult } from '../components/BarcodeScanner';
import type { AddItemData } from '../components/AddItemModal';
import type { StorageLocation } from '../api/locations';
import type { InventoryItem } from '../components/InventoryList';
import {
  fetchLocations,
  createLocation,
  renameLocation,
  deleteLocation,
} from '../api/locations';
import {
  fetchInventory,
  addInventoryItem,
  deleteInventoryItem,
} from '../api/inventory';

const InventoryPage: React.FC = () => {
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [prefillData, setPrefillData] = useState<{
    name?: string;
    brand?: string;
    category?: string;
    barcode?: string;
  } | undefined>();

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

  const handleAddMenuSelect = useCallback((method: 'manual' | 'barcode' | 'receipt') => {
    setAddMenuOpen(false);
    if (method === 'manual') {
      setAddModalOpen(true);
    } else if (method === 'barcode') {
      setScannerOpen(true);
    }
    // Future tasks will wire receipt
  }, []);

  const handleBarcodeDetected = useCallback((result: BarcodeLookupResult) => {
    setScannerOpen(false);
    setPrefillData({
      barcode: result.barcode,
      name: result.product?.name,
      brand: result.product?.brand,
      category: result.product?.category,
    });
    setAddModalOpen(true);
  }, []);

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
        onItemClick={(item) => setSelectedItem(item)}
      />

      <StorageLocationManager
        locations={locations}
        onAdd={handleAddLocation}
        onRename={handleRename}
        onRemove={handleRemoveLocation}
      />

      <AddItemModal
        isOpen={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setPrefillData(undefined);
        }}
        onSubmit={handleAddItem}
        locations={locations}
        prefillData={prefillData}
      />

      {selectedItem && (
        <ItemDetailView
          item={selectedItem}
          locations={locations}
          onClose={() => setSelectedItem(null)}
          onItemUpdated={handleItemUpdated}
        />
      )}

      <BarcodeScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onBarcodeDetected={handleBarcodeDetected}
      />
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
    backgroundColor: '#4a90d9',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
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
    backgroundColor: '#16a34a',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
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
    backgroundColor: '#dc2626',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
  },
  removeButtonActive: {
    backgroundColor: '#991b1b',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
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
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
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
    color: '#1f2937',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '1px solid #f3f4f6',
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  removeModeHint: {
    fontSize: '0.875rem',
    color: '#dc2626',
    marginBottom: '0.75rem',
    fontStyle: 'italic',
  },
};

export default InventoryPage;
