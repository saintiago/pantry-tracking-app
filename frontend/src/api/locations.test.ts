import {
  fetchLocations,
  createLocation,
  renameLocation,
  deleteLocation,
} from './locations';

// Mock config
jest.mock('../config', () => ({
  API_URL: 'https://api.example.com',
}));

// Mock cognitoClient
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

beforeEach(() => {
  jest.resetAllMocks();
  mockGetCurrentSession.mockResolvedValue(mockSession);
  global.fetch = jest.fn();
});

const mockFetch = () => global.fetch as jest.MockedFunction<typeof fetch>;

describe('fetchLocations', () => {
  it('sends GET /locations with auth header and returns locations', async () => {
    const locations = [{ locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01' }];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ locations }),
    } as Response);

    const result = await fetchLocations();

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/locations', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-id-token',
      },
    });
    expect(result).toEqual(locations);
  });

  it('throws when not authenticated', async () => {
    mockGetCurrentSession.mockResolvedValue(null);
    await expect(fetchLocations()).rejects.toThrow('Not authenticated');
  });

  it('throws with server error message on failure', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Server error' }),
    } as Response);

    await expect(fetchLocations()).rejects.toThrow('Server error');
  });
});

describe('createLocation', () => {
  it('sends POST /locations with name and returns created location', async () => {
    const location = { locationId: 'loc-2', name: 'Fridge', createdAt: '2024-01-02' };
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ location }),
    } as Response);

    const result = await createLocation('Fridge');

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/locations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-id-token',
      },
      body: JSON.stringify({ name: 'Fridge' }),
    });
    expect(result).toEqual(location);
  });

  it('throws with duplicate name error from server', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'VALIDATION_ERROR',
        message: 'A storage location with this name already exists',
      }),
    } as Response);

    await expect(createLocation('Pantry')).rejects.toThrow(
      'A storage location with this name already exists',
    );
  });
});

describe('renameLocation', () => {
  it('sends PUT /locations/:id with new name and returns updated location', async () => {
    const location = { locationId: 'loc-1', name: 'Kitchen', createdAt: '2024-01-01' };
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ location }),
    } as Response);

    const result = await renameLocation('loc-1', 'Kitchen');

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/locations/loc-1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-id-token',
      },
      body: JSON.stringify({ name: 'Kitchen' }),
    });
    expect(result).toEqual(location);
  });

  it('throws with duplicate name error from server', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'VALIDATION_ERROR',
        message: 'A storage location with this name already exists',
      }),
    } as Response);

    await expect(renameLocation('loc-1', 'Pantry')).rejects.toThrow(
      'A storage location with this name already exists',
    );
  });
});

describe('deleteLocation', () => {
  it('sends DELETE /locations/:id', async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Storage location deleted' }),
    } as Response);

    await deleteLocation('loc-2');

    expect(mockFetch()).toHaveBeenCalledWith('https://api.example.com/locations/loc-2', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-id-token',
      },
    });
  });

  it('throws when trying to delete non-empty location', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'VALIDATION_ERROR',
        message: 'Cannot remove a storage location that contains inventory items',
      }),
    } as Response);

    await expect(deleteLocation('loc-1')).rejects.toThrow(
      'Cannot remove a storage location that contains inventory items',
    );
  });

  it('throws when trying to delete last location', async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'VALIDATION_ERROR',
        message: 'Cannot remove the last remaining storage location',
      }),
    } as Response);

    await expect(deleteLocation('loc-1')).rejects.toThrow(
      'Cannot remove the last remaining storage location',
    );
  });
});
