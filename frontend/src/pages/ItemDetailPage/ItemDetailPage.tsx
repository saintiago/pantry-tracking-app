import { styles } from './styles';
import ExpirationField from '../../components/ExpirationField/ExpirationField';
import ItemIconField from '../../components/ItemIconField/ItemIconField';
import LocationTag from '../../components/InventoryList/LocationTag';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React, { useCallback, useState } from 'react';
import type { InventoryItem } from '../../domain/inventory/types';
import type { StorageLocation } from '../../api/locations/locations';
import { updateInventoryItem } from '../../api/inventory/inventory';
import { localizedUnits, getUnitLabel, resolveUnit } from '../../types/units';
import { parseFractionalQuantity, formatQuantity } from '../../utils/quantity';

export interface ItemDetailPageProps {
  item: InventoryItem;
  locations: StorageLocation[];
  onBack: () => void;
  onItemUpdated: (
    updatedItem: InventoryItem,
    lowStockTransition?: boolean,
    notification?: { type: string; message: string; itemId?: string; groupId?: string },
  ) => void;
}

interface EditFormState {
  locationDetails: string;
  name: string;
  category: string;
  locationId: string;
  quantity: string;
  unit: string;
  expirationDate: string | null;
  icon: string;
  brand: string;
  barcode: string;
  whereToBuy: string;
  onlineStoreLink: string;
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
  if (form.expirationDate === '') errors.expirationDate = 'Expiration date is required.';
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
    locationDetails: item.locationDetails ?? '',
    quantity: formatQuantity(item.quantity),
    unit: resolveUnit(item.unit),
    expirationDate: item.expirationDate,
    icon: item.icon ?? '',
    brand: item.brand ?? '',
    barcode: item.barcode ?? '',
    whereToBuy: item.whereToBuy ?? '',
    onlineStoreLink: item.onlineStoreLink ?? '',
  };
}

const ItemDetailPage: React.FC<ItemDetailPageProps> = ({
  item,
  locations,
  onBack,
  onItemUpdated,
}) => {
  useLanguage();
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
        locationDetails: editForm.locationDetails.trim(),
        quantity: parseFractionalQuantity(editForm.quantity) ?? 0,
        unit: editForm.unit.trim(),
        expirationDate: editForm.expirationDate,
        icon: editForm.icon,
      };
      if (editForm.brand.trim()) data.brand = editForm.brand.trim();
      if (editForm.barcode.trim()) data.barcode = editForm.barcode.trim();
      if (editForm.whereToBuy.trim()) data.whereToBuy = editForm.whereToBuy.trim();
      if (editForm.onlineStoreLink.trim()) data.onlineStoreLink = editForm.onlineStoreLink.trim();

      const groupingFieldsChanged =
        editForm.name.trim() !== item.name ||
        editForm.category.trim() !== item.category ||
        resolveUnit(editForm.unit) !== resolveUnit(item.unit);
      if (groupingFieldsChanged) {
        const keepCurrentGroup = window.confirm(
          t(
            'Keep this item in its current inventory group? Select Cancel to assign it automatically from its new name, category, and unit.',
          ),
        );
        if (!keepCurrentGroup) data.reassignGroup = true;
      }

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
        <button
          onClick={onBack}
          style={styles.backButton}
          type="button"
          aria-label={t('Go back')}
          disabled={saving}
        >
          {t('← Back')}{' '}
        </button>
        <h2 style={styles.pageTitle}>
          {item.icon} {item.name}
        </h2>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <span>
          {formatQuantity(item.quantity)} {getUnitLabel(item.unit, item.quantity)}
        </span>
        <LocationTag
          ids={[item.location]}
          names={Object.fromEntries(locations.map((loc) => [loc.locationId, loc.name]))}
        />
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
          {translateMessage(submitError)}
        </div>
      )}

      {/* Edit form */}
      <div style={styles.form}>
        {/* Name */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-name" style={styles.label}>
            {t('Product Name')} <span aria-hidden="true">*</span>
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
          {errors.name && (
            <span style={styles.fieldError} role="alert">
              {translateMessage(errors.name)}
            </span>
          )}
        </div>

        {/* Category */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-category" style={styles.label}>
            {t('Category')} <span aria-hidden="true">*</span>
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
          {errors.category && (
            <span style={styles.fieldError} role="alert">
              {translateMessage(errors.category)}
            </span>
          )}
        </div>

        {/* Location */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-location" style={styles.label}>
            {t('Storage Location')} <span aria-hidden="true">*</span>
          </label>
          <select
            id="edit-location"
            value={editForm.locationId}
            onChange={handleChange('locationId')}
            style={styles.select}
            aria-required="true"
            aria-invalid={!!errors.locationId}
          >
            <option value="">{t('Select a location')}</option>
            {locations.map((loc) => (
              <option key={loc.locationId} value={loc.locationId}>
                {loc.name}
              </option>
            ))}
          </select>
          {errors.locationId && (
            <span style={styles.fieldError} role="alert">
              {translateMessage(errors.locationId)}
            </span>
          )}
        </div>

        <div style={styles.fieldGroup}>
          <label htmlFor="edit-location-details" style={styles.label}>
            {t('Location Details')}{' '}
          </label>
          <input
            id="edit-location-details"
            value={editForm.locationDetails}
            onChange={handleChange('locationDetails')}
            placeholder={t('e.g. Shelf 2A')}
            style={styles.input}
          />
        </div>

        {/* Quantity */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-quantity" style={styles.label}>
            {t('Quantity')} <span aria-hidden="true">*</span>
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
          {errors.quantity && (
            <span style={styles.fieldError} role="alert">
              {translateMessage(errors.quantity)}
            </span>
          )}
        </div>

        {/* Unit */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-unit" style={styles.label}>
            {t('Unit')} <span aria-hidden="true">*</span>
          </label>
          <select
            id="edit-unit"
            value={editForm.unit}
            onChange={handleChange('unit')}
            style={styles.select}
            aria-required="true"
            aria-invalid={!!errors.unit}
          >
            <option value="">{t('Select a unit')}</option>
            {localizedUnits().map((u) => (
              <option key={u} value={u}>
                {getUnitLabel(u, 1)}
              </option>
            ))}
          </select>
          {errors.unit && (
            <span style={styles.fieldError} role="alert">
              {translateMessage(errors.unit)}
            </span>
          )}
        </div>

        <ItemIconField
          value={editForm.icon}
          onChange={(icon) => setEditForm((prev) => ({ ...prev, icon }))}
        />
        {/* Expiration Date */}
        <div style={styles.fieldGroup}>
          <ExpirationField
            id="edit-expiration"
            value={editForm.expirationDate}
            onChange={(expirationDate) => {
              setEditForm((prev) => ({ ...prev, expirationDate }));
              setErrors((prev) => ({ ...prev, expirationDate: undefined }));
            }}
            style={styles.input}
            invalid={!!errors.expirationDate}
          />
          {errors.expirationDate && (
            <span style={styles.fieldError} role="alert">
              {translateMessage(errors.expirationDate)}
            </span>
          )}
        </div>

        {/* Brand (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-brand" style={styles.label}>
            {t('Brand')}{' '}
          </label>
          <input
            id="edit-brand"
            type="text"
            value={editForm.brand}
            onChange={handleChange('brand')}
            style={styles.input}
          />
        </div>

        {/* Barcode (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-barcode" style={styles.label}>
            {t('Barcode')}{' '}
          </label>
          <input
            id="edit-barcode"
            type="text"
            value={editForm.barcode}
            onChange={handleChange('barcode')}
            style={styles.input}
          />
        </div>

        {/* Where to Buy (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-wheretobuy" style={styles.label}>
            {t('Where to Buy')}{' '}
          </label>
          <input
            id="edit-wheretobuy"
            type="text"
            value={editForm.whereToBuy}
            onChange={handleChange('whereToBuy')}
            style={styles.input}
          />
        </div>

        {/* Online Store Link (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="edit-onlinelink" style={styles.label}>
            {t('Online Store Link')}{' '}
          </label>
          <input
            id="edit-onlinelink"
            type="url"
            value={editForm.onlineStoreLink}
            onChange={handleChange('onlineStoreLink')}
            style={styles.input}
          />
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
          {t('Cancel')}{' '}
        </button>
        <button
          type="button"
          onClick={handleSave}
          style={{ ...styles.saveButton, ...(saving ? styles.disabledButton : {}) }}
          data-testid="save-button"
          disabled={saving}
        >
          {saving ? t('Saving…') : t('Save')}
        </button>
      </div>
    </div>
  );
};

export default ItemDetailPage;
