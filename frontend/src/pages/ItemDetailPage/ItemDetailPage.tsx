import React, { useCallback, useState } from 'react';
import type { InventoryItem } from '../../components/InventoryList/InventoryList';
import { LowStockBadge } from '../../components/InventoryList/InventoryList';
import type { StorageLocation } from '../../api/locations/locations';
import { updateInventoryItem } from '../../api/inventory/inventory';
import { VALID_UNITS, getUnitLabel, resolveUnit } from '../../types/units';
import { parseFractionalQuantity, formatQuantity } from '../../utils/quantity';

export interface ItemDetailPageProps {
  item: InventoryItem;
  locations: StorageLocation[];
  onBack: () => void;
  onItemUpdated: (
    updatedItem: InventoryItem,
    lowStockTransition?: boolean,
    notification?: { type: string; message: string; itemId: string },
  ) => void;
}

interface EditFormState {
  name: string;
  category: string;
  locationId: string;
  quantity: string;
  unit: string;
  expirationDate: string;
  brand: string;
  barcode: string;
  whereToBuy: string;
  onlineStoreLink: string;
  threshold: string;
}

interface EditFormErrors {
  name?: string;
  category?: string;
  expirationDate?: string;
  locationId?: string;
  quantity?: string;
  unit?: string;
}

function validateForm(form: EditFormState): EditFormErrors {
  const errors: EditFormErrors = {};
  if (!form.name.trim()) errors.name = 'Product name is required.';
  if (!form.category.trim()) errors.category = 'Category is required.';
  if (!form.expirationDate) errors.expirationDate = 'Expiration date is required.';
  if (!form.locationId) errors.locationId = 'Storage location is required.';
  const qty = parseFractionalQuantity(form.quantity);
  if (form.quantity.trim() === '' || qty === null) {
    errors.quantity = 'Quantity is required.';
  } else if (qty < 0) {
    errors.quantity = 'Quantity must be non-negative.';
  }
  if (!form.unit.trim()) errors.unit = 'Unit is required.';
  return errors;
}

function initForm(item: InventoryItem): EditFormState {
  return {
    name: item.name,
    category: item.category,
    locationId: item.location,
    quantity: formatQuantity(item.quantity),
    unit: resolveUnit(item.unit),
    expirationDate: item.expirationDate,
    brand: item.brand ?? '',
    barcode: item.barcode ?? '',
    whereToBuy: item.whereToBuy ?? '',
    onlineStoreLink: item.onlineStoreLink ?? '',
    threshold: item.threshold !== undefined ? String(item.threshold) : '',
  };
}

const ItemDetailPage: React.FC<ItemDetailPageProps> = ({ item, locations, onBack, onItemUpdated }) => {
  const [editForm, setEditForm] = useState<EditFormState>(initForm(item));
  const [errors, setErrors] = useState<EditFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleChange = useCallback(
    (field: keyof EditFormState) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setEditForm((prev) => ({ ...prev, [field]: e.target.value }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      },
    [],
  );

  const handleSave = useCallback(async () => {
    const validationErrors = validateForm(editForm);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    setSubmitError(null);

    try {
      const data: Record<string, unknown> = {
        name: editForm.name.trim(),
        category: editForm.category.trim(),
        locationId: editForm.locationId,
        quantity: parseFractionalQuantity(editForm.quantity) ?? 0,
        unit: editForm.unit.trim(),
        expirationDate: editForm.expirationDate,
      };
      if (editForm.brand.trim()) data.brand = editForm.brand.trim();
      if (editForm.barcode.trim()) data.barcode = editForm.barcode.trim();
      if (editForm.whereToBuy.trim()) data.whereToBuy = editForm.whereToBuy.trim();
      if (editForm.onlineStoreLink.trim()) data.onlineStoreLink = editForm.onlineStoreLink.trim();
      if (editForm.threshold !== '') data.threshold = Number(editForm.threshold);

      const response = await updateInventoryItem(item.itemId, data);
      onItemUpdated(response.item, response.lowStockTransition, response.notification);
      onBack();
    } catch (err: unknown) {
      if (err instanceof TypeError) {
        setSubmitError('Network error — please check your connection and try again');
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('An unexpected error occurred');
      }
    } finally {
      setSaving(false);
    }
  }, [editForm, item.itemId, onItemUpdated, onBack]);

  return (
    <div style={styles.page}>
      {/* Page header with back button */}
      <div style={styles.pageHeader}>
        <button onClick={onBack} style={styles.backButton} type="button" aria-label="Go back" disabled={saving}>
          ← Back
        </button>
        <h2 style={styles.pageTitle}>{item.name}</h2>
        {item.isLowStock && <LowStockBadge />}
      </div>

      {/* Picture */}
      {item.pictureUrl && (
        <div style={styles.pictureContainer}>
          <img src={item.pictureUrl} alt={item.name} style={styles.picture} />
        </div>
      )}

      {/* Error banner */}
      {submitError && (
        <div style={styles.errorBanner} role="alert">
          {submitError}
        </div>
      )}

      {/* Edit form */}
      <div style={styles.form}>
        {/* Name */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-name" style={styles.label}>
            Product Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="edit-name"
            type="text"
            value={editForm.name}
            onChange={handleChange('name')}
            style={styles.input}
            aria-required="true"
            aria-invalid={!!errors.name}
          />
          {errors.name && <span style={styles.fieldError} role="alert">{errors.name}</span>}
        </div>

        {/* Category */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-category" style={styles.label}>
            Category <span aria-hidden="true">*</span>
          </label>
          <input
            id="edit-category"
            type="text"
            value={editForm.category}
            onChange={handleChange('category')}
            style={styles.input}
            aria-required="true"
            aria-invalid={!!errors.category}
          />
          {errors.category && <span style={styles.fieldError} role="alert">{errors.category}</span>}
        </div>

        {/* Location */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-location" style={styles.label}>
            Storage Location <span aria-hidden="true">*</span>
          </label>
          <select
            id="edit-location"
            value={editForm.locationId}
            onChange={handleChange('locationId')}
            style={styles.select}
            aria-required="true"
            aria-invalid={!!errors.locationId}
          >
            <option value="">Select a location</option>
            {locations.map((loc) => (
              <option key={loc.locationId} value={loc.locationId}>
                {loc.name}
              </option>
            ))}
          </select>
          {errors.locationId && <span style={styles.fieldError} role="alert">{errors.locationId}</span>}
        </div>

        {/* Quantity */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-quantity" style={styles.label}>
            Quantity <span aria-hidden="true">*</span>
          </label>
          <input
            id="edit-quantity"
            type="text"
            value={editForm.quantity}
            onChange={handleChange('quantity')}
            style={styles.input}
            aria-required="true"
            aria-invalid={!!errors.quantity}
            placeholder="e.g. 2, 1/2, 1 1/4"
          />
          {errors.quantity && <span style={styles.fieldError} role="alert">{errors.quantity}</span>}
        </div>

        {/* Unit */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-unit" style={styles.label}>
            Unit <span aria-hidden="true">*</span>
          </label>
          <select
            id="edit-unit"
            value={editForm.unit}
            onChange={handleChange('unit')}
            style={styles.select}
            aria-required="true"
            aria-invalid={!!errors.unit}
          >
            <option value="">Select a unit</option>
            {VALID_UNITS.map((u) => (
              <option key={u} value={u}>{getUnitLabel(u, 1)}</option>
            ))}
          </select>
          {errors.unit && <span style={styles.fieldError} role="alert">{errors.unit}</span>}
        </div>

        {/* Expiration Date */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-expiration" style={styles.label}>
            Expiration Date <span aria-hidden="true">*</span>
          </label>
          <input
            id="edit-expiration"
            type="date"
            value={editForm.expirationDate}
            onChange={handleChange('expirationDate')}
            style={styles.input}
            aria-required="true"
            aria-invalid={!!errors.expirationDate}
          />
          {errors.expirationDate && <span style={styles.fieldError} role="alert">{errors.expirationDate}</span>}
        </div>

        {/* Brand (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-brand" style={styles.label}>Brand</label>
          <input id="edit-brand" type="text" value={editForm.brand} onChange={handleChange('brand')} style={styles.input} />
        </div>

        {/* Barcode (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-barcode" style={styles.label}>Barcode</label>
          <input id="edit-barcode" type="text" value={editForm.barcode} onChange={handleChange('barcode')} style={styles.input} />
        </div>

        {/* Where to Buy (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-wheretobuy" style={styles.label}>Where to Buy</label>
          <input id="edit-wheretobuy" type="text" value={editForm.whereToBuy} onChange={handleChange('whereToBuy')} style={styles.input} />
        </div>

        {/* Online Store Link (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-onlinelink" style={styles.label}>Online Store Link</label>
          <input id="edit-onlinelink" type="url" value={editForm.onlineStoreLink} onChange={handleChange('onlineStoreLink')} style={styles.input} />
        </div>

        {/* Threshold (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-threshold" style={styles.label}>Low-Stock Threshold</label>
          <input id="edit-threshold" type="number" min="0" value={editForm.threshold} onChange={handleChange('threshold')} style={styles.input} />
        </div>

        {/* Spacer so content isn't hidden behind fixed action bar */}
        <div style={{ height: 80 }} />
      </div>

      {/* Fixed action bar at bottom */}
      <div style={styles.actionBar} data-testid="action-bar">
        <button
          type="button"
          onClick={onBack}
          style={{ ...styles.cancelButton, ...(saving ? styles.disabledButton : {}) }}
          data-testid="cancel-button"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          style={{ ...styles.saveButton, ...(saving ? styles.disabledButton : {}) }}
          data-testid="save-button"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default ItemDetailPage;

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    position: 'relative',
  },
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
    flexWrap: 'wrap',
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem 0.75rem',
    background: 'none',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: '0.9375rem',
    color: '#374151',
  },
  pageTitle: {
    fontSize: '1.25rem',
    fontWeight: 700,
    margin: 0,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pictureContainer: {
    marginBottom: '1rem',
    display: 'flex',
    justifyContent: 'center',
  },
  picture: {
    maxWidth: '100%',
    maxHeight: 280,
    borderRadius: 8,
    objectFit: 'contain',
  },
  errorBanner: {
    padding: '0.75rem 1rem',
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    borderRadius: 8,
    fontSize: '0.9375rem',
    fontWeight: 600,
    marginBottom: '0.75rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#374151',
  },
  input: {
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
  },
  fieldError: {
    fontSize: '0.8125rem',
    color: '#dc2626',
  },
  actionBar: {
    position: 'fixed',
    bottom: 56, // above bottom nav (56px)
    left: 0,
    right: 0,
    display: 'flex',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e5e7eb',
    zIndex: 20,
    maxWidth: 1920,
    margin: '0 auto',
    height: 72,
    boxSizing: 'border-box',
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    minWidth: 44,
    padding: '0.625rem 1rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
  },
  saveButton: {
    flex: 2,
    minHeight: 44,
    minWidth: 44,
    padding: '0.625rem 1rem',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#ffffff',
    backgroundColor: '#16a34a',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};
