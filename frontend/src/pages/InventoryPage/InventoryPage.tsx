import { styles } from './styles';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import '../../styles/inventory-theme.css';
import InventoryList from '../../components/InventoryList/InventoryList';
import { InAppNotification } from '../../components/InventoryList/InventoryList';
// Type-only import — erased at compile time, does not pull in Quagga
import type { BarcodeLookupResult } from '../../components/BarcodeScanner/BarcodeScanner';

// Lazy value import — Vite emits a separate chunk
const BarcodeScanner = lazy(() => import('../../components/BarcodeScanner/BarcodeScanner'));
import type { AddItemData } from '../AddItemPage/AddItemPage';
import type { StorageLocation } from '../../api/locations/locations';
import type { InventoryGroup, InventoryItem } from '../../domain/inventory/types';
import { replaceInventoryGroup } from '../../domain/inventory/grouping';
import type { PageId } from '../../components/Layout/Layout';
import { fetchLocations } from '../../api/locations/locations';
import {
  fetchInventory,
  addInventoryItem,
  deleteInventoryItem,
  updateInventoryGroupThreshold,
} from '../../api/inventory/inventory';

// --- Barcode Scanner Loading Fallback ---

export const BarcodeScannerLoadingFallback: React.FC = () => {
  useLanguage();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('Loading barcode scanner')}
      data-testid="barcode-scanner-loading"
      style={styles.scannerLoadingOverlay}
    >
      <div style={styles.scannerLoadingModal}>
        <div style={styles.scannerLoadingSpinner} aria-hidden="true" />
        <p style={styles.scannerLoadingText}>{t('Loading scanner…')}</p>
      </div>
    </div>
  );
};

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
        <div data-testid="barcode-scanner-error" style={styles.scannerErrorOverlay}>
          <div style={styles.scannerErrorModal}>
            <p style={styles.scannerErrorText}>{t("Couldn't load the scanner.")}</p>
            <div style={styles.scannerErrorButtons}>
              <button
                style={styles.scannerErrorRetryButton}
                onClick={() => {
                  this.setState({ error: null });
                  this.props.onRetry();
                }}
                type="button"
              >
                {t('Retry')}{' '}
              </button>
              <button
                style={styles.scannerErrorCloseButton}
                onClick={this.props.onClose}
                type="button"
              >
                {t('Close')}{' '}
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
      notification?: { type: string; message: string; itemId?: string; groupId?: string },
    ) => void,
  ) => void;
}

const InventoryPage: React.FC<InventoryPageProps> = ({
  onNavigate: _onNavigate,
  onNavigateToAddItem,
  onNavigateToItemDetail,
}) => {
  useLanguage();
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryGroups, setInventoryGroups] = useState<InventoryGroup[]>([]);
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
    setInventoryGroups(data.groups ?? []);
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

  const handleAddMenuSelect = useCallback(
    (method: 'manual' | 'barcode' | 'receipt') => {
      setAddMenuOpen(false);
      if (method === 'manual') {
        onNavigateToAddItem(locations, handleAddItem);
      } else if (method === 'barcode') {
        setScannerOpen(true);
      }
      // Future tasks will wire receipt
    },
    [locations, onNavigateToAddItem, handleAddItem],
  );

  const handleBarcodeDetected = useCallback(
    (result: BarcodeLookupResult) => {
      setScannerOpen(false);
      const saved = inventoryItems.some((item) => item.barcode === result.barcode);
      onNavigateToAddItem(locations, handleAddItem, {
        barcode: result.barcode,
        name: saved ? undefined : result.product?.name,
        brand: saved ? undefined : result.product?.brand,
        category: saved ? undefined : result.product?.category,
      });
    },
    [locations, onNavigateToAddItem, handleAddItem, inventoryItems],
  );

  const [removalError, setRemovalError] = useState<string | null>(null);
  const removing = useRef(false);
  const handleRemoveItem = useCallback(
    async (itemId: string) => {
      if (removing.current) return;
      const item = inventoryItems.find((entry) => entry.itemId === itemId);
      if (!item || !window.confirm(t('Remove {0} from inventory?', item.name))) return;
      removing.current = true;
      setRemovalError(null);
      let deleted = false;
      try {
        await deleteInventoryItem(itemId);
        deleted = true;
        setInventoryItems((current) => current.filter((entry) => entry.itemId !== itemId));
        const data = await fetchInventory();
        setInventoryItems(data.items);
        setInventoryGroups(data.groups ?? []);
        if (data.items.length === 0) setRemoveMode(false);
      } catch {
        setRemovalError(
          deleted
            ? 'Item removed. Could not refresh inventory. Please refresh.'
            : 'Could not remove item. Please try again.',
        );
      } finally {
        removing.current = false;
      }
    },
    [inventoryItems],
  );

  const handleItemUpdated = useCallback(
    (
      updatedItem: InventoryItem,
      lowStockTransition?: boolean,
      notificationData?: { type: string; message: string; itemId?: string; groupId?: string },
    ) => {
      setInventoryItems((prev) =>
        prev.map((i) => (i.itemId === updatedItem.itemId ? updatedItem : i)),
      );
      if (lowStockTransition && notificationData) {
        setNotification({ message: notificationData.message, visible: true });
      }
    },
    [],
  );

  const handleItemClick = useCallback(
    (item: InventoryItem) => {
      onNavigateToItemDetail(item, locations, handleItemUpdated);
    },
    [locations, onNavigateToItemDetail, handleItemUpdated],
  );

  const toggleRemoveMode = useCallback(() => {
    setRemoveMode((prev) => !prev);
  }, []);

  const handleUpdateThreshold = useCallback(
    async (groupId: string, threshold: number | null, thresholdUnit?: string) => {
      const result = await updateInventoryGroupThreshold(groupId, threshold, thresholdUnit);
      setInventoryGroups((previous) => replaceInventoryGroup(previous, groupId, result.group));
      if (result.lowStockTransition && result.notification) {
        setNotification({ message: result.notification.message, visible: true });
      }
    },
    [],
  );

  if (loading) {
    return (
      <div style={styles.centered} role="status" aria-label={t('Loading')}>
        <p>{t('Loading…')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centered} role="alert">
        <p style={styles.errorText}>{translateMessage(error)}</p>
        <button onClick={loadAll} style={styles.retryButton}>
          {t('Retry')}{' '}
        </button>
      </div>
    );
  }

  return (
    <div className="page inventory-page">
      <h2>{t('Inventory')}</h2>

      <InAppNotification
        message={notification.message}
        visible={notification.visible}
        onDismiss={() => setNotification((prev) => ({ ...prev, visible: false }))}
      />

      {removalError && (
        <div
          role="alert"
          style={{ background: 'var(--color-danger)', padding: 12, borderRadius: 8 }}
        >
          {translateMessage(removalError)}
          <button
            type="button"
            style={styles.retryButton}
            onClick={async () => {
              try {
                await loadInventory();
                setRemovalError(null);
              } catch {
                /* Keep the retry visible. */
              }
            }}
          >
            {t('Refresh')}
          </button>
        </div>
      )}
      {/* Main action buttons */}
      <div style={styles.actionRow}>
        <div style={styles.addButtonWrapper}>
          <button
            onClick={() => setAddMenuOpen((prev) => !prev)}
            style={styles.addButton}
            aria-label={t('Add item')}
            aria-expanded={addMenuOpen}
            aria-haspopup="menu"
          >
            <span style={styles.buttonIcon} aria-hidden="true">
              +
            </span>
            <span>{t('Add')}</span>
          </button>
          {addMenuOpen && (
            <div style={styles.addMenu} role="menu" aria-label={t('Add item methods')}>
              <button
                role="menuitem"
                style={styles.menuItem}
                onClick={() => handleAddMenuSelect('manual')}
              >
                {t('✏️ Manual Entry')}{' '}
              </button>
              <button
                role="menuitem"
                style={styles.menuItem}
                onClick={() => handleAddMenuSelect('barcode')}
              >
                {t('📷 Barcode Scan')}{' '}
              </button>
              <button
                role="menuitem"
                style={styles.menuItem}
                onClick={() => handleAddMenuSelect('receipt')}
              >
                {t('🧾 Receipt Photo')}{' '}
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
          aria-label={t('Remove item')}
          aria-pressed={removeMode}
        >
          <span style={styles.buttonIcon} aria-hidden="true">
            −
          </span>
          <span>{t('Remove')}</span>
        </button>
      </div>

      {removeMode && (
        <p style={styles.removeModeHint} role="status">
          {t('Tap an item to remove it. Press Remove again to exit.')}{' '}
        </p>
      )}

      <InventoryList
        items={inventoryItems}
        groups={inventoryGroups}
        locations={locations}
        removeMode={removeMode}
        onRemoveItem={handleRemoveItem}
        onItemClick={handleItemClick}
        onUpdateThreshold={handleUpdateThreshold}
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

export default InventoryPage;
