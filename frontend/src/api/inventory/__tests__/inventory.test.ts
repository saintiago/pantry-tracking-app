import {
  fetchInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  fetchLowStockItems,
  searchInventory,
} from '../inventory';

jest.mock('../../../config', () => ({
  API_URL: 'https://api.example.com',
}));

jest.mock('../../../auth/cognitoClient/cognitoClient', () => ({
  getCurrentSession: jest.fn(),
}));

import { getCurrentSession } from '../../../auth/cognitoClient/cognitoClient';

const mockGetCurrentSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;

const mockSession = {
  user: { userId: 'user-1', email: 'test@example.com' },
  tokens: {
    idToken: 'mock-id-token',
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  },
};

const expectedHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer mock-id-token',
};

beforeEach(() => {
  jest.resetAllMocks();
  mockGetCurrentSession.mockResolvedValue(mockSession);
  global.fetch = jest.fn();
});

const mockFetch = () => global.fetch as jest.MockedFunction<typeof fetch>;

describe('fetchInventory', () => {
  it('sends GET /inventory with auth header and returns items', async () => {
    const items = [{ itemId: 'item-1', name: 'Milk' }];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ items }),
    } as Response);

    const result = await fetchInventory();

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/inventory', {
      headers: expectedHeaders,
    });
    expect(result).toEqual({ items });
  });

  it('throws when not authenticated', async () => {
    mockGetCurrentSession.mockResolvedValue(null);
    await expect(fetchInventory()).rejects.toThrow('Not authenticated');
  });

  it('throws with server error message on failure', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Internal server error' }),
    } as Response);

    await expect(fetchInventory()).rejects.toThrow('Internal server error');
  });
});

describe('addInventoryItem', () => {
  it('sends POST /inventory with data and returns created item', async () => {
    const item = { itemId: 'item-2', name: 'Eggs' };
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ item }),
    } as Response);

    const data = { name: 'Eggs', category: 'Dairy', quantity: 12, unit: 'pcs',
      expirationDate: '2025-01-01', locationId: 'loc-1' };
    const result = await addInventoryItem(data);

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/inventory', {
      method: 'POST',
      headers: expectedHeaders,
      body: JSON.stringify(data),
    });
    expect(result).toEqual({ item });
  });

  it('throws with validation error message on failure', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields',
        details: [{ field: 'name', message: 'name is required' }],
      }),
    } as Response);

    await expect(addInventoryItem({})).rejects.toThrow('Missing required fields');
  });
});

describe('updateInventoryItem', () => {
  it('sends PUT /inventory/:id with data and returns updated item', async () => {
    const item = { itemId: 'item-1', name: 'Milk', quantity: 3 };
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ item, lowStockTransition: true, notification: {
        type: 'LOW_STOCK', message: 'Milk is running low', itemId: 'item-1',
      } }),
    } as Response);

    const data = { quantity: 3 };
    const result = await updateInventoryItem('item-1', data);

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/inventory/item-1', {
      method: 'PUT',
      headers: expectedHeaders,
      body: JSON.stringify(data),
    });
    expect(result.lowStockTransition).toBe(true);
    expect(result.notification?.message).toBe('Milk is running low');
  });

  it('throws on not found', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'NOT_FOUND', message: 'Inventory item not found' }),
    } as Response);

    await expect(updateInventoryItem('bad-id', { quantity: 1 })).rejects.toThrow(
      'Inventory item not found',
    );
  });
});

describe('deleteInventoryItem', () => {
  it('sends DELETE /inventory/:id', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Inventory item deleted' }),
    } as Response);

    await deleteInventoryItem('item-1');

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/inventory/item-1', {
      method: 'DELETE',
      headers: expectedHeaders,
    });
  });

  it('throws on not found', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'NOT_FOUND', message: 'Inventory item not found' }),
    } as Response);

    await expect(deleteInventoryItem('bad-id')).rejects.toThrow('Inventory item not found');
  });
});

describe('fetchLowStockItems', () => {
  it('sends GET /inventory/low-stock with auth header', async () => {
    const items = [{ itemId: 'item-1', name: 'Milk', isLowStock: true }];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ items }),
    } as Response);

    const result = await fetchLowStockItems();

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/inventory/low-stock', {
      headers: expectedHeaders,
    });
    expect(result).toEqual({ items });
  });

  it('throws with server error message on failure', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Server error' }),
    } as Response);

    await expect(fetchLowStockItems()).rejects.toThrow('Server error');
  });
});

describe('searchInventory', () => {
  it('sends GET /inventory/search with field and query parameters for barcode field', async () => {
    const items = [
      { itemId: 'item-1', name: 'Milk', barcode: '123456' },
      { itemId: 'item-2', name: 'Cheese', barcode: '123789' },
    ];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({
        field: 'barcode',
        query: '123',
        resultType: 'items',
        items,
        count: 2,
      }),
    } as Response);

    const result = await searchInventory('barcode', '123');

    expect(mockFetch()).toHaveBeenCalledWith(
      'https://api.example.com/inventory/search?field=barcode&query=123',
      {
        method: 'GET',
        headers: expectedHeaders,
      },
    );
    expect(result.resultType).toBe('items');
    expect(result.items).toEqual(items);
    expect(result.count).toBe(2);
  });

  it('sends GET /inventory/search with field and query parameters for name field', async () => {
    const items = [
      { itemId: 'item-1', name: 'Milk', category: 'Dairy' },
      { itemId: 'item-2', name: 'Milkshake', category: 'Beverages' },
    ];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({
        field: 'name',
        query: 'milk',
        resultType: 'items',
        items,
        count: 2,
      }),
    } as Response);

    const result = await searchInventory('name', 'milk');

    expect(mockFetch()).toHaveBeenCalledWith(
      'https://api.example.com/inventory/search?field=name&query=milk',
      {
        method: 'GET',
        headers: expectedHeaders,
      },
    );
    expect(result.resultType).toBe('items');
    expect(result.items).toEqual(items);
  });

  it('sends GET /inventory/search for category field and returns distinct values', async () => {
    const values = ['Dairy', 'Dairy Products', 'Dairy Alternatives'];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({
        field: 'category',
        query: 'dairy',
        resultType: 'values',
        values,
        count: 3,
      }),
    } as Response);

    const result = await searchInventory('category', 'dairy');

    expect(mockFetch()).toHaveBeenCalledWith(
      'https://api.example.com/inventory/search?field=category&query=dairy',
      {
        method: 'GET',
        headers: expectedHeaders,
      },
    );
    expect(result.resultType).toBe('values');
    expect(result.values).toEqual(values);
    expect(result.count).toBe(3);
  });

  it('sends GET /inventory/search for brand field and returns distinct values', async () => {
    const values = ['Organic Valley', 'Horizon Organic'];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({
        field: 'brand',
        query: 'organic',
        resultType: 'values',
        values,
        count: 2,
      }),
    } as Response);

    const result = await searchInventory('brand', 'organic');

    expect(mockFetch()).toHaveBeenCalledWith(
      'https://api.example.com/inventory/search?field=brand&query=organic',
      {
        method: 'GET',
        headers: expectedHeaders,
      },
    );
    expect(result.resultType).toBe('values');
    expect(result.values).toEqual(values);
  });

  it('sends GET /inventory/search for whereToBuy field and returns distinct values', async () => {
    const values = ['Whole Foods', 'Trader Joes'];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({
        field: 'whereToBuy',
        query: 'whole',
        resultType: 'values',
        values,
        count: 2,
      }),
    } as Response);

    const result = await searchInventory('whereToBuy', 'whole');

    expect(mockFetch()).toHaveBeenCalledWith(
      'https://api.example.com/inventory/search?field=whereToBuy&query=whole',
      {
        method: 'GET',
        headers: expectedHeaders,
      },
    );
    expect(result.resultType).toBe('values');
    expect(result.values).toEqual(values);
  });

  it('sends GET /inventory/search for onlineStoreLink field and returns distinct values', async () => {
    const values = ['https://amazon.com/product1', 'https://amazon.com/product2'];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({
        field: 'onlineStoreLink',
        query: 'amazon',
        resultType: 'values',
        values,
        count: 2,
      }),
    } as Response);

    const result = await searchInventory('onlineStoreLink', 'amazon');

    expect(mockFetch()).toHaveBeenCalledWith(
      'https://api.example.com/inventory/search?field=onlineStoreLink&query=amazon',
      {
        method: 'GET',
        headers: expectedHeaders,
      },
    );
    expect(result.resultType).toBe('values');
    expect(result.values).toEqual(values);
  });

  it('properly encodes special characters in query parameters', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({
        field: 'name',
        query: 'milk & honey',
        resultType: 'items',
        items: [],
        count: 0,
      }),
    } as Response);

    await searchInventory('name', 'milk & honey');

    expect(mockFetch()).toHaveBeenCalledWith(
      'https://api.example.com/inventory/search?field=name&query=milk%20%26%20honey',
      {
        method: 'GET',
        headers: expectedHeaders,
      },
    );
  });

  it('throws when not authenticated', async () => {
    mockGetCurrentSession.mockResolvedValue(null);
    await expect(searchInventory('barcode', '123')).rejects.toThrow('Not authenticated');
  });

  it('throws with server error message on failure', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Invalid field parameter' }),
    } as Response);

    await expect(searchInventory('barcode', '123')).rejects.toThrow('Invalid field parameter');
  });

  it('throws with default error message when response has no message', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(searchInventory('barcode', '123')).rejects.toThrow('Inventory search failed');
  });

  it('returns empty results when no matches found', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({
        field: 'barcode',
        query: '999',
        resultType: 'items',
        items: [],
        count: 0,
      }),
    } as Response);

    const result = await searchInventory('barcode', '999');

    expect(result.items).toEqual([]);
    expect(result.count).toBe(0);
  });
});
