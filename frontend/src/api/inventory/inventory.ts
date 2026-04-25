import { API_URL } from '../../config';
import { getCurrentSession } from '../../auth/cognitoClient/cognitoClient';
import type { InventoryItem } from '../../components/InventoryList/InventoryList';

export type { InventoryItem } from '../../components/InventoryList/InventoryList';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error('Not authenticated');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.tokens.idToken}`,
  };
}

export interface FetchInventoryResponse {
  items: InventoryItem[];
  lastEvaluatedKey?: string;
}

export interface MutationResponse {
  item: InventoryItem;
  lowStockTransition?: boolean;
  notification?: { type: string; message: string; itemId: string };
}

export async function fetchInventory(): Promise<FetchInventoryResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/inventory`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to fetch inventory');
  }
  return res.json();
}

export async function addInventoryItem(
  data: Record<string, unknown>,
): Promise<MutationResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/inventory`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to add inventory item');
  }
  return res.json();
}

export async function updateInventoryItem(
  itemId: string,
  data: Record<string, unknown>,
): Promise<MutationResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/inventory/${itemId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to update inventory item');
  }
  return res.json();
}

export async function deleteInventoryItem(itemId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/inventory/${itemId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to delete inventory item');
  }
}

export async function fetchLowStockItems(): Promise<{
  items: InventoryItem[];
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/inventory/low-stock`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to fetch low stock items');
  }
  return res.json();
}

export interface BarcodeLookupResponse {
  found: boolean;
  product?: {
    name: string;
    brand?: string;
    category?: string;
  };
}

export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/inventory/barcode-lookup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ barcode }),
  });
  if (!res.ok) {
    throw new Error('Barcode lookup failed');
  }
  return res.json();
}

export interface InventorySearchRequest {
  field: 'barcode' | 'name' | 'category' | 'brand' | 'whereToBuy' | 'onlineStoreLink';
  query: string;
}

export interface InventorySearchResponse {
  field: string;
  query: string;
  resultType: 'items' | 'values';
  items?: InventoryItem[];
  values?: string[];
  count: number;
}

export async function searchInventory(
  field: 'barcode' | 'name' | 'category' | 'brand' | 'whereToBuy' | 'onlineStoreLink',
  query: string,
): Promise<InventorySearchResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${API_URL}/inventory/search?field=${encodeURIComponent(field)}&query=${encodeURIComponent(query)}`,
    {
      method: 'GET',
      headers,
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Inventory search failed');
  }
  return res.json();
}
