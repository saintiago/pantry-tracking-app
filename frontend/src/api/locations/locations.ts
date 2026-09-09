import { apiRequest } from '../client';

export interface StorageLocation {
  locationId: string;
  name: string;
  color?: string;
  createdAt: string;
}

export async function fetchLocations(): Promise<StorageLocation[]> {
  const result = await apiRequest<{ locations: StorageLocation[] }>(
    `/locations`,
    'Failed to fetch locations',
  );
  const data = result;
  return data.locations;
}

export async function createLocation(name: string, color?: string): Promise<StorageLocation> {
  const result = await apiRequest<{ location: StorageLocation }>(
    `/locations`,
    'Failed to create location',
    {
      method: 'POST',
      body: JSON.stringify({ name, ...(color ? { color } : {}) }),
    },
  );
  const data = result;
  return data.location;
}

export async function renameLocation(
  locationId: string,
  name: string,
  color?: string,
): Promise<StorageLocation> {
  const result = await apiRequest<{ location: StorageLocation }>(
    `/locations/${encodeURIComponent(locationId)}`,
    'Failed to rename location',
    {
      method: 'PUT',
      body: JSON.stringify({ name, ...(color ? { color } : {}) }),
    },
  );
  const data = result;
  return data.location;
}

export async function deleteLocation(locationId: string): Promise<void> {
  await apiRequest<void>(
    `/locations/${encodeURIComponent(locationId)}`,
    'Failed to delete location',
    {
      method: 'DELETE',
      responseType: 'empty',
    },
  );
}
