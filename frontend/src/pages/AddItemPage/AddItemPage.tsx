import { styles } from './styles';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { StorageLocation } from '../../api/locations/locations';
import {
  localizedUnits,
  VALID_UNITS,
  LEGACY_UNIT_MAP,
  getUnitLabel,
  resolveUnit,
} from '../../types/units';
import type { UnitType } from '../../types/units';
import { searchInventory, lookupBarcode } from '../../api/inventory/inventory';
import type { InventoryItem } from '../../api/inventory/inventory';
import AutocompleteDropdown from '../../components/AutocompleteDropdown/AutocompleteDropdown';
import { parseFractionalQuantity } from '../../utils/quantity';

export interface AddItemData {
  name: string;
  category: string;
  expirationDate: string;
  locationId: string;
  locationDetails?: string;
  pictureUrl?: string;
  quantity: number;
  unit: string;
  barcode?: string;
  brand?: string;
  whereToBuy?: string;
  onlineStoreLink?: string;
  pictureFile?: File;
}

export interface AddItemPageProps {
  onBack: () => void;
  onSubmit: (item: AddItemData) => Promise<{ error?: string }>;
  locations: StorageLocation[];
  prefillData?: Partial<Omit<AddItemData, 'pictureFile'>>;
  title?: string;
  submitText?: string;
  backLabel?: string;
  returnAfterSave?: boolean;
}

interface FormErrors {
  name?: string;
  category?: string;
  expirationDate?: string;
  locationId?: string;
  quantity?: string;
  unit?: string;
}

interface DropdownState {
  visible: boolean;
  items?: InventoryItem[];
  values?: string[];
  focusedIndex: number;
}

const INITIAL_FORM = {
  name: '',
  category: '',
  expirationDate: '',
  locationId: '',
  locationDetails: '',
  pictureUrl: '',
  quantity: '',
  unit: 'piece',
  barcode: '',
  brand: '',
  whereToBuy: '',
  onlineStoreLink: '',
};

const AUTOFILL_STYLES = {
  // Prefilled highlight (blue): used when a field was populated by Autofill.
  prefilled: {
    backgroundColor: 'var(--color-sky)',
    borderColor: 'var(--color-action)',
  },
};

const AddItemPage: React.FC<AddItemPageProps> = ({
  onBack,
  onSubmit,
  locations,
  prefillData,
  title = 'Add Item',
  submitText = 'Add new item',
  backLabel = 'Go back',
  returnAfterSave = true,
}) => {
  useLanguage();
  const [form, setForm] = useState({
    ...INITIAL_FORM,
    name: prefillData?.name ?? '',
    brand: prefillData?.brand ?? '',
    category: prefillData?.category ?? '',
    barcode: prefillData?.barcode ?? '',
    quantity: prefillData?.quantity !== undefined ? String(prefillData.quantity) : '',
    unit: prefillData?.unit ?? 'piece',
    locationId: prefillData?.locationId ?? '',
    expirationDate: prefillData?.expirationDate ?? '',
    locationDetails: prefillData?.locationDetails ?? '',
    pictureUrl: prefillData?.pictureUrl ?? '',
    whereToBuy: prefillData?.whereToBuy ?? '',
    onlineStoreLink: prefillData?.onlineStoreLink ?? '',
  });
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [prefilledFields, setPrefilledFields] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (prefillData?.name) initial.add('name');
    if (prefillData?.brand) initial.add('brand');
    if (prefillData?.category) initial.add('category');
    if (prefillData?.barcode) initial.add('barcode');
    return initial;
  });
  const prefilledFieldsRef = useRef<Set<string>>(new Set());
  const [userEditedFields, setUserEditedFields] = useState<Set<string>>(new Set());
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lastLookupBarcode, setLastLookupBarcode] = useState<string | null>(null);

  // Keep ref in sync so handleChange always reads the latest prefilledFields
  // without needing it in its dependency array (avoids stale closure on autofill)
  useEffect(() => {
    prefilledFieldsRef.current = prefilledFields;
  }, [prefilledFields]);

  const [autocompleteDropdowns, setAutocompleteDropdowns] = useState<Record<string, DropdownState>>(
    {
      barcode: { visible: false, items: [], focusedIndex: -1 },
      name: { visible: false, items: [], focusedIndex: -1 },
      category: { visible: false, values: [], focusedIndex: -1 },
      brand: { visible: false, values: [], focusedIndex: -1 },
      whereToBuy: { visible: false, values: [], focusedIndex: -1 },
      onlineStoreLink: { visible: false, values: [], focusedIndex: -1 },
    },
  );

  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});

  // Focus Product Name on mount
  useEffect(() => {
    document.getElementById('add-item-name')?.focus();
  }, []);

  const [editExpiration, setEditExpiration] = useState(false);
  useEffect(() => {
    if (!editExpiration) return;
    const input = document.getElementById('add-item-expiration') as HTMLInputElement | null;
    input?.focus();
    try {
      input?.showPicker();
    } catch {
      // Browsers may require a direct gesture; the date field remains focused for editing.
    }
    setEditExpiration(false);
  }, [editExpiration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(abortControllers.current).forEach((c) => c.abort());
      Object.values(debounceTimers.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  const performFullAutofill = useCallback((item: InventoryItem, triggerField: string) => {
    setForm((prev) => {
      const updates: Partial<typeof prev> = {};
      const newPrefilledFields = new Set<string>();

      if ((triggerField === 'name' || !prev.name) && item.name) {
        updates.name = item.name;
        newPrefilledFields.add('name');
      }
      if (!prev.category && item.category) {
        updates.category = item.category;
        newPrefilledFields.add('category');
      }
      if (!prev.brand && item.brand) {
        updates.brand = item.brand;
        newPrefilledFields.add('brand');
      }
      if (
        (!prev.unit || prev.unit === 'piece') &&
        item.unit &&
        (VALID_UNITS.includes(item.unit as UnitType) || item.unit in LEGACY_UNIT_MAP)
      ) {
        updates.unit = resolveUnit(item.unit);
        newPrefilledFields.add('unit');
      }
      if (!prev.locationId && item.location) {
        updates.locationId = item.location;
        newPrefilledFields.add('locationId');
      }
      if (!prev.locationDetails && item.locationDetails) {
        updates.locationDetails = item.locationDetails;
        newPrefilledFields.add('locationDetails');
      }
      if (!prev.pictureUrl && item.pictureUrl) {
        updates.pictureUrl = item.pictureUrl;
        newPrefilledFields.add('pictureUrl');
      }
      if (!prev.quantity) {
        updates.quantity = '1';
        newPrefilledFields.add('quantity');
      }
      if (!prev.whereToBuy && item.whereToBuy) {
        updates.whereToBuy = item.whereToBuy;
        newPrefilledFields.add('whereToBuy');
      }
      if (!prev.onlineStoreLink && item.onlineStoreLink) {
        updates.onlineStoreLink = item.onlineStoreLink;
        newPrefilledFields.add('onlineStoreLink');
      }
      if ((triggerField === 'barcode' || !prev.barcode) && item.barcode) {
        updates.barcode = item.barcode;
        newPrefilledFields.add('barcode');
      }

      // Copy the suggestion's expiration date only when it is non-empty AND the field
      // is empty, marking it prefilled (Req 4.1, 4.2). An existing user-entered value is
      // left untouched, and a suggestion with no expiration leaves the field unchanged
      // (Req 4.4, 4.5).
      const didFillExpiration = !prev.expirationDate && !!item.expirationDate;
      if (didFillExpiration) {
        updates.expirationDate = item.expirationDate;
        newPrefilledFields.add('expirationDate');
      }

      if (newPrefilledFields.size > 0) {
        setPrefilledFields((p) => new Set([...p, ...newPrefilledFields]));
      }

      if (didFillExpiration || (triggerField === 'barcode' && !prev.expirationDate)) {
        setEditExpiration(true);
      }

      return { ...prev, ...updates };
    });
  }, []);

  useEffect(() => {
    if (!prefillData?.barcode) return;
    let cancelled = false;
    searchInventory('barcode', prefillData.barcode)
      .then((result) => {
        const latest = result.items
          ?.filter((item) => item.barcode === prefillData.barcode)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (!cancelled && latest) performFullAutofill(latest, 'barcode');
      })
      .catch(() => {
        if (!cancelled)
          setLookupError('Could not load saved product details. You can enter them manually.');
      });
    return () => {
      cancelled = true;
    };
  }, [prefillData?.barcode, performFullAutofill]);

  const performSingleAutofill = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setPrefilledFields((prev) => new Set([...prev, field]));
    setUserEditedFields((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }, []);

  const triggerSearch = useCallback(async (field: string, query: string) => {
    if (abortControllers.current[field]) {
      abortControllers.current[field].abort();
    }
    const controller = new AbortController();
    abortControllers.current[field] = controller;

    try {
      const response = await searchInventory(
        field as 'barcode' | 'name' | 'category' | 'brand' | 'whereToBuy' | 'onlineStoreLink',
        query,
      );
      if (controller.signal.aborted) return;
      setAutocompleteDropdowns((prev) => ({
        ...prev,
        [field]: {
          visible: response.count > 0,
          items: response.items || [],
          values: response.values || [],
          focusedIndex: -1,
        },
      }));
      return response.count === 0;
    } catch {
      if (controller.signal.aborted) return;
      setAutocompleteDropdowns((prev) => ({
        ...prev,
        [field]: { visible: false, items: [], values: [], focusedIndex: -1 },
      }));
    }
  }, []);

  const triggerExternalLookup = useCallback(
    async (barcode: string) => {
      if (lastLookupBarcode === barcode || lookupLoading) return;
      setLookupLoading(true);
      setLookupError(null);
      setLastLookupBarcode(barcode);

      try {
        const response = await lookupBarcode(barcode);
        if (response.found && response.product) {
          const product = response.product;
          setForm((prev) => {
            const updates: Partial<typeof prev> = {};
            const newPrefilledFields = new Set<string>();
            if (!prev.name && product.name) {
              updates.name = product.name;
              newPrefilledFields.add('name');
            }
            if (!prev.category && product.category) {
              updates.category = product.category;
              newPrefilledFields.add('category');
            }
            if (!prev.brand && product.brand) {
              updates.brand = product.brand;
              newPrefilledFields.add('brand');
            }
            if (!prev.quantity) {
              updates.quantity = '1';
              newPrefilledFields.add('quantity');
            }
            if (newPrefilledFields.size > 0) {
              setPrefilledFields((p) => new Set([...p, ...newPrefilledFields]));
            }
            return { ...prev, ...updates };
          });
        }
      } catch {
        setLookupError('Unable to lookup barcode. Please check your connection and try again.');
      } finally {
        setLookupLoading(false);
      }
    },
    [lastLookupBarcode, lookupLoading],
  );

  const handleChange = useCallback(
    (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      setSubmitError(null);

      // Use ref to always read the latest prefilledFields, avoiding stale closure
      if (prefilledFieldsRef.current.has(field)) {
        if (value === '') {
          setPrefilledFields((prev) => {
            const next = new Set(prev);
            next.delete(field);
            return next;
          });
          setUserEditedFields((prev) => {
            const next = new Set(prev);
            next.delete(field);
            return next;
          });
        } else {
          setUserEditedFields((prev) => new Set([...prev, field]));
        }
      }

      if (field === 'barcode') setLookupError(null);

      const thresholds: Record<string, number> = {
        barcode: 3,
        name: 3,
        category: 1,
        brand: 1,
        whereToBuy: 1,
        onlineStoreLink: 3,
      };
      const threshold = thresholds[field];
      if (threshold === undefined) return;

      if (debounceTimers.current[field]) clearTimeout(debounceTimers.current[field]);

      if (value.length < threshold) {
        setAutocompleteDropdowns((prev) => ({
          ...prev,
          [field]: { visible: false, items: [], values: [], focusedIndex: -1 },
        }));
        return;
      }

      debounceTimers.current[field] = setTimeout(async () => {
        const noLocalMatches = await triggerSearch(field, value);
        if (field === 'barcode' && value.length >= 8 && noLocalMatches) {
          await triggerExternalLookup(value);
        }
      }, 300);
    },
    [triggerSearch, triggerExternalLookup],
  );

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPictureFile(e.target.files?.[0] ?? null);
  }, []);

  const handleDropdownSelect = useCallback(
    (field: string, index: number) => {
      const dropdown = autocompleteDropdowns[field];
      if (field === 'barcode' || field === 'name') {
        if (dropdown.items && dropdown.items[index])
          performFullAutofill(dropdown.items[index], field);
      } else {
        if (dropdown.values && dropdown.values[index])
          performSingleAutofill(field, dropdown.values[index]);
      }
      setAutocompleteDropdowns((prev) => ({
        ...prev,
        [field]: { ...prev[field], visible: false, focusedIndex: -1 },
      }));
    },
    [autocompleteDropdowns, performFullAutofill, performSingleAutofill],
  );

  const handleDropdownClose = useCallback((field: string) => {
    setAutocompleteDropdowns((prev) => ({
      ...prev,
      [field]: { ...prev[field], visible: false, focusedIndex: -1 },
    }));
  }, []);

  const handleDropdownFocusChange = useCallback((field: string, index: number) => {
    setAutocompleteDropdowns((prev) => ({
      ...prev,
      [field]: { ...prev[field], focusedIndex: index },
    }));
  }, []);

  const getFieldStyle = useCallback(
    (field: string): React.CSSProperties => {
      // A field is highlighted as prefilled only while it was populated by Autofill
      // and the user has not edited it.
      if (prefilledFields.has(field) && !userEditedFields.has(field)) {
        return {
          ...styles.input,
          ...AUTOFILL_STYLES.prefilled,
        };
      }
      return styles.input;
    },
    [prefilledFields, userEditedFields],
  );

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!form.name.trim()) errs.name = 'Product name is required.';
    if (!form.category.trim()) errs.category = 'Category is required.';
    if (!form.expirationDate) errs.expirationDate = 'Expiration date is required.';
    if (!form.locationId) errs.locationId = 'Storage location is required.';
    const qty = parseFractionalQuantity(form.quantity);
    if (form.quantity.trim() === '' || qty === null) {
      errs.quantity = 'Quantity is required.';
    } else if (qty < 0) {
      errs.quantity = 'Quantity must be non-negative.';
    }
    if (!form.unit.trim()) errs.unit = 'Unit is required.';
    return errs;
  }, [form]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSuccessMessage(null);
      const errs = validate();
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        return;
      }
      setSubmitting(true);
      setSubmitError(null);

      const data: AddItemData = {
        name: form.name.trim(),
        category: form.category.trim(),
        expirationDate: form.expirationDate,
        locationId: form.locationId,
        ...(form.locationDetails.trim() ? { locationDetails: form.locationDetails.trim() } : {}),
        ...(form.pictureUrl ? { pictureUrl: form.pictureUrl } : {}),
        quantity: parseFractionalQuantity(form.quantity) ?? 0,
        unit: form.unit.trim(),
      };
      if (form.barcode.trim()) data.barcode = form.barcode.trim();
      if (form.brand.trim()) data.brand = form.brand.trim();
      if (form.whereToBuy.trim()) data.whereToBuy = form.whereToBuy.trim();
      if (form.onlineStoreLink.trim()) data.onlineStoreLink = form.onlineStoreLink.trim();
      if (pictureFile) data.pictureFile = pictureFile;

      try {
        const result = await onSubmit(data);
        if (result.error) {
          setSubmitError(result.error);
        } else {
          setSuccessMessage('Item added successfully!');
          if (returnAfterSave) setTimeout(() => onBack(), 1200);
        }
      } catch {
        setSubmitError('An unexpected error occurred.');
      } finally {
        setSubmitting(false);
      }
    },
    [form, pictureFile, validate, onSubmit, onBack, returnAfterSave],
  );

  const submitLabel = submitting ? 'Adding…' : submitText;

  return (
    <div style={styles.page}>
      {/* Page header with back button */}
      <div style={styles.pageHeader}>
        <button onClick={onBack} style={styles.backButton} type="button" aria-label={t(backLabel)}>
          {t('← Back')}{' '}
        </button>
        <h2 style={styles.pageTitle}>{t(title)}</h2>
      </div>

      {successMessage && (
        <div style={styles.successBanner} role="status">
          {translateMessage(successMessage)}
        </div>
      )}

      {submitError && (
        <div style={styles.errorBanner} role="alert">
          {translateMessage(submitError)}
        </div>
      )}

      <form id="add-item-form" onSubmit={handleSubmit} noValidate style={styles.form}>
        {/* Name */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-name" style={styles.label}>
            {t('Product Name')} <span aria-hidden="true">*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="add-item-name"
              type="text"
              value={form.name}
              onChange={handleChange('name')}
              style={getFieldStyle('name')}
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-autocomplete={autocompleteDropdowns.name.visible ? 'list' : undefined}
              aria-controls={autocompleteDropdowns.name.visible ? 'name-dropdown' : undefined}
              aria-expanded={autocompleteDropdowns.name.visible}
            />
            {errors.name && (
              <span style={styles.fieldError} role="alert">
                {translateMessage(errors.name)}
              </span>
            )}
            <AutocompleteDropdown
              isVisible={autocompleteDropdowns.name.visible}
              items={autocompleteDropdowns.name.items}
              focusedIndex={autocompleteDropdowns.name.focusedIndex}
              onSelect={(index) => handleDropdownSelect('name', index)}
              onClose={() => handleDropdownClose('name')}
              onFocusChange={(index) => handleDropdownFocusChange('name', index)}
              inputId="add-item-name"
              dropdownId="name-dropdown"
              renderItem={(item) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-secondary)' }}>
                    {item.category} {item.brand ? `• ${item.brand}` : ''}
                  </div>
                </div>
              )}
              ariaLabel="Product name suggestions"
            />
          </div>
        </div>

        {/* Category */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-category" style={styles.label}>
            {t('Category')} <span aria-hidden="true">*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="add-item-category"
              type="text"
              value={form.category}
              onChange={handleChange('category')}
              style={getFieldStyle('category')}
              aria-required="true"
              aria-invalid={!!errors.category}
              aria-autocomplete={autocompleteDropdowns.category.visible ? 'list' : undefined}
              aria-controls={
                autocompleteDropdowns.category.visible ? 'category-dropdown' : undefined
              }
              aria-expanded={autocompleteDropdowns.category.visible}
            />
            {errors.category && (
              <span style={styles.fieldError} role="alert">
                {translateMessage(errors.category)}
              </span>
            )}
            <AutocompleteDropdown
              isVisible={autocompleteDropdowns.category.visible}
              values={autocompleteDropdowns.category.values}
              focusedIndex={autocompleteDropdowns.category.focusedIndex}
              onSelect={(index) => handleDropdownSelect('category', index)}
              onClose={() => handleDropdownClose('category')}
              onFocusChange={(index) => handleDropdownFocusChange('category', index)}
              inputId="add-item-category"
              dropdownId="category-dropdown"
              ariaLabel="Category suggestions"
            />
          </div>
        </div>

        {/* Expiration Date */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-expiration" style={styles.label}>
            {t('Expiration Date')} <span aria-hidden="true">*</span>
          </label>
          <input
            id="add-item-expiration"
            type="date"
            value={form.expirationDate}
            onChange={handleChange('expirationDate')}
            style={styles.input}
            aria-required="true"
            aria-invalid={!!errors.expirationDate}
          />
          {errors.expirationDate && (
            <span style={styles.fieldError} role="alert">
              {translateMessage(errors.expirationDate)}
            </span>
          )}
        </div>

        {/* Location */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-location" style={styles.label}>
            {t('Storage Location')} <span aria-hidden="true">*</span>
          </label>
          <select
            id="add-item-location"
            value={form.locationId}
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
          <label htmlFor="add-item-location-details" style={styles.label}>
            {t('Location Details')}{' '}
          </label>
          <input
            id="add-item-location-details"
            value={form.locationDetails}
            onChange={handleChange('locationDetails')}
            placeholder={t('e.g. Shelf 2A')}
            style={styles.input}
          />
        </div>

        {/* Quantity */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-quantity" style={styles.label}>
            {t('Quantity')} <span aria-hidden="true">*</span>
          </label>
          <input
            id="add-item-quantity"
            type="text"
            value={form.quantity}
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
          <label htmlFor="add-item-unit" style={styles.label}>
            {t('Unit')} <span aria-hidden="true">*</span>
          </label>
          <select
            id="add-item-unit"
            value={form.unit}
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

        {/* Barcode (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-barcode" style={styles.label}>
            {t('Barcode')}{' '}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="add-item-barcode"
              type="text"
              value={form.barcode}
              onChange={handleChange('barcode')}
              style={getFieldStyle('barcode')}
              aria-autocomplete={autocompleteDropdowns.barcode.visible ? 'list' : undefined}
              aria-controls={autocompleteDropdowns.barcode.visible ? 'barcode-dropdown' : undefined}
              aria-expanded={autocompleteDropdowns.barcode.visible}
            />
            {lookupLoading && <div style={styles.loadingIndicator}>{t('Looking up...')}</div>}
            {lookupError && (
              <span style={styles.fieldError} role="alert">
                {translateMessage(lookupError)}
              </span>
            )}
            <AutocompleteDropdown
              isVisible={autocompleteDropdowns.barcode.visible}
              items={autocompleteDropdowns.barcode.items}
              focusedIndex={autocompleteDropdowns.barcode.focusedIndex}
              onSelect={(index) => handleDropdownSelect('barcode', index)}
              onClose={() => handleDropdownClose('barcode')}
              onFocusChange={(index) => handleDropdownFocusChange('barcode', index)}
              inputId="add-item-barcode"
              dropdownId="barcode-dropdown"
              renderItem={(item) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{item.barcode}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-secondary)' }}>
                    {item.name} {item.brand ? `• ${item.brand}` : ''}
                  </div>
                </div>
              )}
              ariaLabel="Barcode suggestions"
            />
          </div>
        </div>

        {/* Brand (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-brand" style={styles.label}>
            {t('Brand')}{' '}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="add-item-brand"
              type="text"
              value={form.brand}
              onChange={handleChange('brand')}
              style={getFieldStyle('brand')}
              aria-autocomplete={autocompleteDropdowns.brand.visible ? 'list' : undefined}
              aria-controls={autocompleteDropdowns.brand.visible ? 'brand-dropdown' : undefined}
              aria-expanded={autocompleteDropdowns.brand.visible}
            />
            <AutocompleteDropdown
              isVisible={autocompleteDropdowns.brand.visible}
              values={autocompleteDropdowns.brand.values}
              focusedIndex={autocompleteDropdowns.brand.focusedIndex}
              onSelect={(index) => handleDropdownSelect('brand', index)}
              onClose={() => handleDropdownClose('brand')}
              onFocusChange={(index) => handleDropdownFocusChange('brand', index)}
              inputId="add-item-brand"
              dropdownId="brand-dropdown"
              ariaLabel="Brand suggestions"
            />
          </div>
        </div>

        {/* Where to Buy (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-wheretobuy" style={styles.label}>
            {t('Where to Buy')}{' '}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="add-item-wheretobuy"
              type="text"
              value={form.whereToBuy}
              onChange={handleChange('whereToBuy')}
              style={getFieldStyle('whereToBuy')}
              aria-autocomplete={autocompleteDropdowns.whereToBuy.visible ? 'list' : undefined}
              aria-controls={
                autocompleteDropdowns.whereToBuy.visible ? 'wheretobuy-dropdown' : undefined
              }
              aria-expanded={autocompleteDropdowns.whereToBuy.visible}
            />
            <AutocompleteDropdown
              isVisible={autocompleteDropdowns.whereToBuy.visible}
              values={autocompleteDropdowns.whereToBuy.values}
              focusedIndex={autocompleteDropdowns.whereToBuy.focusedIndex}
              onSelect={(index) => handleDropdownSelect('whereToBuy', index)}
              onClose={() => handleDropdownClose('whereToBuy')}
              onFocusChange={(index) => handleDropdownFocusChange('whereToBuy', index)}
              inputId="add-item-wheretobuy"
              dropdownId="wheretobuy-dropdown"
              ariaLabel="Where to buy suggestions"
            />
          </div>
        </div>

        {/* Online Store Link (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-onlinelink" style={styles.label}>
            {t('Online Store Link')}{' '}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="add-item-onlinelink"
              type="url"
              value={form.onlineStoreLink}
              onChange={handleChange('onlineStoreLink')}
              style={getFieldStyle('onlineStoreLink')}
              aria-autocomplete={autocompleteDropdowns.onlineStoreLink.visible ? 'list' : undefined}
              aria-controls={
                autocompleteDropdowns.onlineStoreLink.visible ? 'onlinelink-dropdown' : undefined
              }
              aria-expanded={autocompleteDropdowns.onlineStoreLink.visible}
            />
            <AutocompleteDropdown
              isVisible={autocompleteDropdowns.onlineStoreLink.visible}
              values={autocompleteDropdowns.onlineStoreLink.values}
              focusedIndex={autocompleteDropdowns.onlineStoreLink.focusedIndex}
              onSelect={(index) => handleDropdownSelect('onlineStoreLink', index)}
              onClose={() => handleDropdownClose('onlineStoreLink')}
              onFocusChange={(index) => handleDropdownFocusChange('onlineStoreLink', index)}
              inputId="add-item-onlinelink"
              dropdownId="onlinelink-dropdown"
              ariaLabel="Online store link suggestions"
            />
          </div>
        </div>

        {/* Picture (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-picture" style={styles.label}>
            {t('Picture')}{' '}
          </label>
          {form.pictureUrl && !pictureFile && (
            <img
              src={form.pictureUrl}
              alt={t('Product photo')}
              style={{ width: 96, height: 96, objectFit: 'contain' }}
            />
          )}
          <input
            id="add-item-picture"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={styles.fileInput}
          />
        </div>

        {/* Spacer so content isn't hidden behind fixed action bar */}
        <div style={{ height: 80 }} />
      </form>

      {/* Fixed action bar at bottom */}
      <div style={styles.actionBar} data-testid="action-bar">
        <button type="button" onClick={onBack} style={styles.cancelButton} disabled={submitting}>
          {t('Cancel')}{' '}
        </button>
        <button
          type="submit"
          form="add-item-form"
          style={styles.submitButton}
          disabled={submitting}
        >
          {t(submitLabel)}
        </button>
      </div>
    </div>
  );
};

export default AddItemPage;
