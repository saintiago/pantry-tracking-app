import { apiRequest } from '../client';
import type { InventoryItem } from '../../domain/inventory/types';
import type { InventoryGroup } from '../../domain/inventory/types';

export type { InventoryItem, InventoryGroup } from '../../domain/inventory/types';

export interface FetchInventoryResponse {
  items: InventoryItem[];
  groups?: InventoryGroup[];
  lastEvaluatedKey?: string;
}

export interface MutationResponse {
  item: InventoryItem;
  groups?: InventoryGroup[];
  lowStockTransition?: boolean;
  notification?: { type: string; message: string; groupId?: string; itemId?: string };
}

export interface GroupMutationResponse {
  group?: InventoryGroup; // Absent when clearing the threshold removes an empty group.
  lowStockTransition?: boolean;
  notification?: { type: string; message: string; groupId?: string; itemId?: string };
}

export async function fetchInventory(signal?: AbortSignal): Promise<FetchInventoryResponse> {
  const items: InventoryItem[] = [];
  const groups = new Map<string, InventoryGroup>();
  const seen = new Set<string>();
  let cursor: string | undefined;
  let hasGroups = false;
  do {
    const page = await apiRequest<FetchInventoryResponse>(
      `/inventory${cursor ? `?lastEvaluatedKey=${encodeURIComponent(cursor)}` : ''}`,
      'Failed to fetch inventory',
      signal ? { signal } : {},
    );
    items.push(...page.items);
    hasGroups ||= page.groups !== undefined;
    page.groups?.forEach((group) => groups.set(group.groupId, group));
    cursor = page.lastEvaluatedKey;
    if (cursor && seen.has(cursor))
      throw new Error('Inventory pagination did not advance. Please retry.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return { items, ...(hasGroups ? { groups: [...groups.values()] } : {}) };
}

export async function addInventoryItem(data: Record<string, unknown>): Promise<MutationResponse> {
  const result = await apiRequest<MutationResponse>(`/inventory`, 'Failed to add inventory item', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result;
}

export async function updateInventoryItem(
  itemId: string,
  data: Record<string, unknown>,
): Promise<MutationResponse> {
  const result = await apiRequest<MutationResponse>(
    `/inventory/${encodeURIComponent(itemId)}`,
    'Failed to update inventory item',
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
  return result;
}

export async function deleteInventoryItem(itemId: string): Promise<void> {
  await apiRequest<void>(
    `/inventory/${encodeURIComponent(itemId)}`,
    'Failed to delete inventory item',
    {
      method: 'DELETE',
      responseType: 'empty',
    },
  );
}

export async function fetchLowStockItems(): Promise<{
  groups: InventoryGroup[];
}> {
  const result = await apiRequest<{ groups: InventoryGroup[] }>(
    `/inventory/low-stock`,
    'Failed to fetch low stock items',
  );
  return result;
}

export async function updateInventoryGroupThreshold(
  groupId: string,
  threshold: number | null,
  thresholdUnit?: string,
): Promise<GroupMutationResponse> {
  const result = await apiRequest<GroupMutationResponse>(
    `/inventory/groups/${encodeURIComponent(groupId)}`,
    'Failed to update inventory group',
    {
      method: 'PUT',
      body: JSON.stringify({ threshold, ...(thresholdUnit ? { thresholdUnit } : {}) }),
    },
  );
  return result;
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
  const result = await apiRequest<BarcodeLookupResponse>(
    `/inventory/barcode-lookup`,
    'Barcode lookup failed',
    {
      method: 'POST',
      useServerMessage: false,
      body: JSON.stringify({ barcode }),
    },
  );
  return result;
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
  const result = await apiRequest<InventorySearchResponse>(
    `/inventory/search?field=${encodeURIComponent(field)}&query=${encodeURIComponent(query)}`,
    'Inventory search failed',
    {
      method: 'GET',
    },
  );
  return result;
}
