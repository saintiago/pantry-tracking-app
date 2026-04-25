import { API_URL } from '../../config';
import { getCurrentSession } from '../../auth/cognitoClient/cognitoClient';

export interface StorageLocation {
  locationId: string;
  name: string;
  createdAt: string;
}

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

export async function fetchLocations(): Promise<StorageLocation[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/locations`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to fetch locations');
  }
  const data = await res.json();
  return data.locations;
}

export async function createLocation(name: string): Promise<StorageLocation> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/locations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to create location');
  }
  const data = await res.json();
  return data.location;
}

export async function renameLocation(
  locationId: string,
  name: string,
): Promise<StorageLocation> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/locations/${locationId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to rename location');
  }
  const data = await res.json();
  return data.location;
}

export async function deleteLocation(locationId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/locations/${locationId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to delete location');
  }
}
