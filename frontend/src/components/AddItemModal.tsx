import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { StorageLocation } from '../api/locations';

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

export interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (item: AddItemData) => Promise<{ error?: string }>;
  locations: StorageLocation[];
}

interface FormErrors {
  name?: string;
  category?: string;
  expirationDate?: string;
  locationId?: string;
  quantity?: string;
  unit?: string;
}

const INITIAL_FORM = {
  name: '',
  category: '',
  expirationDate: '',
  locationId: '',
  quantity: '',
  unit: '',
  barcode: '',
  brand: '',
  whereToBuy: '',
  onlineStoreLink: '',
};

const AddItemModal: React.FC<AddItemModalProps> = ({ isOpen, onClose, onSubmit, locations }) => {
  const [form, setForm] = useState(INITIAL_FORM);
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = 'add-item-modal-title';

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setForm(INITIAL_FORM);
      setPictureFile(null);
      setErrors({});
      setSubmitError(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length > 0) {
      focusable[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleChange = useCallback(
    (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      setSubmitError(null);
    },
    [],
  );

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPictureFile(file);
  }, []);

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
          setTimeout(() => {
            onClose();
          }, 1200);
        }
      } catch {
        setSubmitError('An unexpected error occurred.');
      } finally {
        setSubmitting(false);
      }
    },
    [form, pictureFile, validate, onSubmit, onClose],
  );

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose} data-testid="add-item-overlay">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h2 id={headingId} style={styles.title}>
            Add Item
          </h2>
          <button
            onClick={onClose}
            style={styles.closeButton}
            aria-label="Close add item modal"
            type="button"
          >
            ✕
          </button>
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

        <form onSubmit={handleSubmit} noValidate style={styles.form}>
          {/* Name */}
          <div style={styles.fieldGroup}>
            <label htmlFor="add-item-name" style={styles.label}>
              Product Name <span aria-hidden="true">*</span>
            </label>
            <input
              id="add-item-name"
              type="text"
              value={form.name}
              onChange={handleChange('name')}
              style={styles.input}
              aria-required="true"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <span style={styles.fieldError} role="alert">
                {errors.name}
              </span>
            )}
          </div>

          {/* Category */}
          <div style={styles.fieldGroup}>
            <label htmlFor="add-item-category" style={styles.label}>
              Category <span aria-hidden="true">*</span>
            </label>
            <input
              id="add-item-category"
              type="text"
              value={form.category}
              onChange={handleChange('category')}
              style={styles.input}
              aria-required="true"
              aria-invalid={!!errors.category}
            />
            {errors.category && (
              <span style={styles.fieldError} role="alert">
                {errors.category}
              </span>
            )}
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
            {errors.expirationDate && (
              <span style={styles.fieldError} role="alert">
                {errors.expirationDate}
              </span>
            )}
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
            {errors.locationId && (
              <span style={styles.fieldError} role="alert">
                {errors.locationId}
              </span>
            )}
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
            {errors.quantity && (
              <span style={styles.fieldError} role="alert">
                {errors.quantity}
              </span>
            )}
          </div>

          {/* Unit */}
          <div style={styles.fieldGroup}>
            <label htmlFor="add-item-unit" style={styles.label}>
              Unit <span aria-hidden="true">*</span>
            </label>
            <input
              id="add-item-unit"
              type="text"
              value={form.unit}
              onChange={handleChange('unit')}
              style={styles.input}
              aria-required="true"
              aria-invalid={!!errors.unit}
            />
            {errors.unit && (
              <span style={styles.fieldError} role="alert">
                {errors.unit}
              </span>
            )}
          </div>

          {/* Barcode (optional) */}
          <div style={styles.fieldGroup}>
            <label htmlFor="add-item-barcode" style={styles.label}>
              Barcode
            </label>
            <input
              id="add-item-barcode"
              type="text"
              value={form.barcode}
              onChange={handleChange('barcode')}
              style={styles.input}
            />
          </div>

          {/* Brand (optional) */}
          <div style={styles.fieldGroup}>
            <label htmlFor="add-item-brand" style={styles.label}>
              Brand
            </label>
            <input
              id="add-item-brand"
              type="text"
              value={form.brand}
              onChange={handleChange('brand')}
              style={styles.input}
            />
          </div>

          {/* Where to Buy (optional) */}
          <div style={styles.fieldGroup}>
            <label htmlFor="add-item-wheretobuy" style={styles.label}>
              Where to Buy
            </label>
            <input
              id="add-item-wheretobuy"
              type="text"
              value={form.whereToBuy}
              onChange={handleChange('whereToBuy')}
              style={styles.input}
            />
          </div>

          {/* Online Store Link (optional) */}
          <div style={styles.fieldGroup}>
            <label htmlFor="add-item-onlinelink" style={styles.label}>
              Online Store Link
            </label>
            <input
              id="add-item-onlinelink"
              type="url"
              value={form.onlineStoreLink}
              onChange={handleChange('onlineStoreLink')}
              style={styles.input}
            />
          </div>

          {/* Picture (optional — file input placeholder) */}
          <div style={styles.fieldGroup}>
            <label htmlFor="add-item-picture" style={styles.label}>
              Picture
            </label>
            <input
              id="add-item-picture"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={styles.fileInput}
            />
          </div>

          <button type="submit" style={styles.submitButton} disabled={submitting}>
            {submitting ? 'Adding…' : 'Add Item'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddItemModal;


const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '1.25rem',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 700,
    margin: 0,
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.125rem',
    background: 'none',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    color: '#374151',
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
  submitButton: {
    minHeight: 48,
    minWidth: 44,
    padding: '0.75rem 1rem',
    fontSize: '1.0625rem',
    fontWeight: 700,
    color: '#ffffff',
    backgroundColor: '#16a34a',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
};
