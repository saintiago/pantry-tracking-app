import type { InventoryItem } from '../../domain/inventory/types';
export interface AddItemData {
  name: string;
  category: string;
  expirationDate: string | null;
  icon?: string;
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

export interface FormErrors {
  name?: string;
  category?: string;
  expirationDate?: string;
  locationId?: string;
  quantity?: string;
  unit?: string;
}

export interface DropdownState {
  visible: boolean;
  items?: InventoryItem[];
  values?: string[];
  focusedIndex: number;
}

export const INITIAL_FORM = {
  name: '',
  category: '',
  expirationDate: '' as string | null,
  icon: '',
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

export const AUTOFILL_STYLES = {
  // Prefilled highlight (blue): used when a field was populated by Autofill.
  prefilled: {
    backgroundColor: 'var(--color-sky)',
    borderColor: 'var(--color-action)',
  },
};
