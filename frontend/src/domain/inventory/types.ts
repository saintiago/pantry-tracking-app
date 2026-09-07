export interface InventoryItem {
  itemId: string;
  groupId?: string;
  name: string;
  category: string;
  expirationDate: string | null;
  icon?: string;
  location: string; // locationId
  locationDetails?: string;
  quantity: number;
  unit: string;
  /** @deprecated Low-stock state is owned by InventoryGroup. */
  isLowStock?: boolean;
  barcode?: string;
  brand?: string;
  whereToBuy?: string;
  onlineStoreLink?: string;
  pictureUrl?: string;
  threshold?: number;
  thresholdUnit?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryGroup {
  groupId: string;
  canonicalKey: string;
  name: string;
  category: string;
  unit: string;
  threshold?: number;
  thresholdUnit?: string;
  totalQuantity: number;
  isLowStock: boolean;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}
