import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { StorageLocation } from '../../api/locations/locations';
import { VALID_UNITS } from '../../types/units';
import { searchInventory, lookupBarcode } from '../../api/inventory/inventory';
import type { InventoryItem } from '../../api/inventory/inventory';
import AutocompleteDropdown from '../../components/AutocompleteDropdown/AutocompleteDropdown';

export interface AddItemData {
  name: string;
  category: string;
  expirationDate: string;
  locationId: string;
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
  prefillData?: {
    name?: string;
    brand?: string;
    category?: string;
    barcode?: string;
  };
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
  quantity: '',
  unit: 'Unit',
  barcode: '',
  brand: '',
  whereToBuy: '',
  onlineStoreLink: '',
};

const AUTOFILL_STYLES = {
  prefilled: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
};

const AddItemPage: React.FC<AddItemPageProps> = ({ onBack, onSubmit, locations, prefillData }) => {
  const [form, setForm] = useState({
    ...INITIAL_FORM,
    name: prefillData?.name ?? '',
    brand: prefillData?.brand ?? '',
    category: prefillData?.category ?? '',
    barcode: prefillData?.barcode ?? '',
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
  const [userEditedFields, setUserEditedFields] = useState<Set<string>>(new Set());
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lastLookupBarcode, setLastLookupBarcode] = useState<string | null>(null);

  const [autocompleteDropdowns, setAutocompleteDropdowns] = useState<Record<string, DropdownState>>({
    barcode: { visible: false, items: [], focusedIndex: -1 },
    name: { visible: false, items: [], focusedIndex: -1 },
    category: { visible: false, values: [], focusedIndex: -1 },
    brand: { visible: false, values: [], focusedIndex: -1 },
    whereToBuy: { visible: false, values: [], focusedIndex: -1 },
    onlineStoreLink: { visible: false, values: [], focusedIndex: -1 },
  });

  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});

  // Focus Product Name on mount
  useEffect(() => {
    document.getElementById('add-item-name')?.focus();
  }, []);

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

      if ((triggerField === 'name' || !prev.name) && item.name) { updates.name = item.name; newPrefilledFields.add('name'); }
      if (!prev.category && item.category) { updates.category = item.category; newPrefilledFields.add('category'); }
      if (!prev.brand && item.brand) { updates.brand = item.brand; newPrefilledFields.add('brand'); }
      if ((!prev.unit || prev.unit === 'Unit') && item.unit && VALID_UNITS.includes(item.unit as never)) { updates.unit = item.unit; newPrefilledFields.add('unit'); }
      if (!prev.locationId && item.location) { updates.locationId = item.location; newPrefilledFields.add('locationId'); }
      if (!prev.quantity) { updates.quantity = '1'; newPrefilledFields.add('quantity'); }
      if (!prev.whereToBuy && item.whereToBuy) { updates.whereToBuy = item.whereToBuy; newPrefilledFields.add('whereToBuy'); }
      if (!prev.onlineStoreLink && item.onlineStoreLink) { updates.onlineStoreLink = item.onlineStoreLink; newPrefilledFields.add('onlineStoreLink'); }
      if ((triggerField === 'barcode' || !prev.barcode) && item.barcode) { updates.barcode = item.barcode; newPrefilledFields.add('barcode'); }

      if (newPrefilledFields.size > 0) {
        setPrefilledFields((p) => new Set([...p, ...newPrefilledFields]));
      }

      if (!prev.expirationDate) {
        setTimeout(() => {
          const el = document.getElementById('add-item-expiration') as HTMLInputElement | null;
          if (el) {
            el.focus();
            try { el.showPicker(); } catch { /* showPicker not supported */ }
          }
        }, 50);
      }

      return { ...prev, ...updates };
    });
  }, []);

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
            if (!prev.name && product.name) { updates.name = product.name; newPrefilledFields.add('name'); }
            if (!prev.category && product.category) { updates.category = product.category; newPrefilledFields.add('category'); }
            if (!prev.brand && product.brand) { updates.brand = product.brand; newPrefilledFields.add('brand'); }
            if (!prev.quantity) { updates.quantity = '1'; newPrefilledFields.add('quantity'); }
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

      if (prefilledFields.has(field)) {
        if (value === '') {
          setPrefilledFields((prev) => { const next = new Set(prev); next.delete(field); return next; });
          setUserEditedFields((prev) => { const next = new Set(prev); next.delete(field); return next; });
        } else {
          setUserEditedFields((prev) => new Set([...prev, field]));
        }
      }

      if (field === 'barcode') setLookupError(null);

      const thresholds: Record<string, number> = {
        barcode: 3, name: 3, category: 1, brand: 1, whereToBuy: 1, onlineStoreLink: 3,
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
        await triggerSearch(field, value);
        if (field === 'barcode' && value.length >= 8) {
          const dropdown = autocompleteDropdowns[field];
          if (!dropdown.visible || (dropdown.items && dropdown.items.length === 0)) {
            await triggerExternalLookup(value);
          }
        }
      }, 300);
    },
    [prefilledFields, triggerSearch, triggerExternalLookup, autocompleteDropdowns],
  );

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPictureFile(e.target.files?.[0] ?? null);
  }, []);

  const handleDropdownSelect = useCallback(
    (field: string, index: number) => {
      const dropdown = autocompleteDropdowns[field];
      if (field === 'barcode' || field === 'name') {
        if (dropdown.items && dropdown.items[index]) performFullAutofill(dropdown.items[index], field);
      } else {
        if (dropdown.values && dropdown.values[index]) performSingleAutofill(field, dropdown.values[index]);
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
      if (prefilledFields.has(field) && !userEditedFields.has(field)) {
        return { ...styles.input, ...AUTOFILL_STYLES.prefilled };
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
    const qty = Number(form.quantity);
    if (form.quantity === '' || isNaN(qty)) {
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
        quantity: Number(form.quantity),
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
          setTimeout(() => onBack(), 1200);
        }
      } catch {
        setSubmitError('An unexpected error occurred.');
      } finally {
        setSubmitting(false);
      }
    },
    [form, pictureFile, validate, onSubmit, onBack],
  );

  return (
    <div style={styles.page}>
      {/* Page header with back button */}
      <div style={styles.pageHeader}>
        <button onClick={onBack} style={styles.backButton} type="button" aria-label="Go back">
          ← Back
        </button>
        <h2 style={styles.pageTitle}>Add Item</h2>
      </div>

      {successMessage && (
        <div style={styles.successBanner} role="status">
          {successMessage}
        </div>
      )}

      {submitError && (
        <div style={styles.errorBanner} role="alert">
          {submitError}
        </div>
      )}

      <form id="add-item-form" onSubmit={handleSubmit} noValidate style={styles.form}>
        {/* Name */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-name" style={styles.label}>
            Product Name <span aria-hidden="true">*</span>
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
            {errors.name && <span style={styles.fieldError} role="alert">{errors.name}</span>}
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
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
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
            Category <span aria-hidden="true">*</span>
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
              aria-controls={autocompleteDropdowns.category.visible ? 'category-dropdown' : undefined}
              aria-expanded={autocompleteDropdowns.category.visible}
            />
            {errors.category && <span style={styles.fieldError} role="alert">{errors.category}</span>}
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
            Expiration Date <span aria-hidden="true">*</span>
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
          {errors.expirationDate && <span style={styles.fieldError} role="alert">{errors.expirationDate}</span>}
        </div>

        {/* Location */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-location" style={styles.label}>
            Storage Location <span aria-hidden="true">*</span>
          </label>
          <select
            id="add-item-location"
            value={form.locationId}
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
          <label htmlFor="add-item-quantity" style={styles.label}>
            Quantity <span aria-hidden="true">*</span>
          </label>
          <input
            id="add-item-quantity"
            type="number"
            min="0"
            value={form.quantity}
            onChange={handleChange('quantity')}
            style={styles.input}
            aria-required="true"
            aria-invalid={!!errors.quantity}
          />
          {errors.quantity && <span style={styles.fieldError} role="alert">{errors.quantity}</span>}
        </div>

        {/* Unit */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-unit" style={styles.label}>
            Unit <span aria-hidden="true">*</span>
          </label>
          <select
            id="add-item-unit"
            value={form.unit}
            onChange={handleChange('unit')}
            style={styles.select}
            aria-required="true"
            aria-invalid={!!errors.unit}
          >
            <option value="">Select a unit</option>
            {VALID_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          {errors.unit && <span style={styles.fieldError} role="alert">{errors.unit}</span>}
        </div>

        {/* Barcode (optional) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="add-item-barcode" style={styles.label}>Barcode</label>
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
            {lookupLoading && <div style={styles.loadingIndicator}>Looking up...</div>}
            {lookupError && <span style={styles.fieldError} role="alert">{lookupError}</span>}
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
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
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
          <label htmlFor="add-item-brand" style={styles.label}>Brand</label>
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
          <label htmlFor="add-item-wheretobuy" style={styles.label}>Where to Buy</label>
          <div style={{ position: 'relative' }}>
            <input
              id="add-item-wheretobuy"
              type="text"
              value={form.whereToBuy}
              onChange={handleChange('whereToBuy')}
              style={getFieldStyle('whereToBuy')}
              aria-autocomplete={autocompleteDropdowns.whereToBuy.visible ? 'list' : undefined}
              aria-controls={autocompleteDropdowns.whereToBuy.visible ? 'wheretobuy-dropdown' : undefined}
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
          <label htmlFor="add-item-onlinelink" style={styles.label}>Online Store Link</label>
          <div style={{ position: 'relative' }}>
            <input
              id="add-item-onlinelink"
              type="url"
              value={form.onlineStoreLink}
              onChange={handleChange('onlineStoreLink')}
              style={getFieldStyle('onlineStoreLink')}
              aria-autocomplete={autocompleteDropdowns.onlineStoreLink.visible ? 'list' : undefined}
              aria-controls={autocompleteDropdowns.onlineStoreLink.visible ? 'onlinelink-dropdown' : undefined}
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
          <label htmlFor="add-item-picture" style={styles.label}>Picture</label>
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
        <button
          type="button"
          onClick={onBack}
          style={styles.cancelButton}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="add-item-form"
          style={styles.submitButton}
          disabled={submitting}
        >
          {submitting ? 'Adding…' : 'Add Item'}
        </button>
      </div>
    </div>
  );
};

export default AddItemPage;

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
  fileInput: {
    minHeight: 44,
    padding: '0.5rem 0',
    fontSize: '1rem',
  },
  fieldError: {
    fontSize: '0.8125rem',
    color: '#dc2626',
  },
  errorBanner: {
    padding: '0.75rem 1rem',
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    color: '#dc2626',
    fontSize: '0.875rem',
    marginBottom: '0.5rem',
  },
  successBanner: {
    padding: '0.75rem 1rem',
    backgroundColor: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: 8,
    color: '#16a34a',
    fontSize: '0.875rem',
    marginBottom: '0.5rem',
  },
  loadingIndicator: {
    fontSize: '0.8125rem',
    color: '#6b7280',
    marginTop: '0.25rem',
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
  submitButton: {
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
};
