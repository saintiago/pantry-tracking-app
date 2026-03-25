import {
  fetchInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  fetchLowStockItems,
} from './inventory';

jest.mock('../config', () => ({
  API_URL: 'https://api.example.com',
}));

jest.mock('../auth/cognitoClient', () => ({
  getCurrentSession: jest.fn(),
}));

import { getCurrentSession } from '../auth/cognitoClient';

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
