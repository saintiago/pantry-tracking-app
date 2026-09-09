import DisplaySettings from './DisplaySettings';
import LanguageSwitcher from '../../components/LanguageSwitcher/LanguageSwitcher';
import React, { useCallback, useEffect, useState } from 'react';
import { t, useLanguage, message } from '../../i18n/i18n';
import StorageLocationManager from '../../components/StorageLocationManager/StorageLocationManager';
import {
  fetchLocations,
  createLocation,
  renameLocation,
  deleteLocation,
} from '../../api/locations/locations';
import type { StorageLocation } from '../../api/locations/locations';

export default function SettingsPage() {
  useLanguage();
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadLocations = useCallback(async () => {
    const data = await fetchLocations();
    setLocations(data);
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadLocations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, [loadLocations]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const handleAddLocation = useCallback(
    async (name: string, color: string): Promise<{ error?: string }> => {
      try {
        await createLocation(name, color);
        await refresh();
        return {};
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add location';
        return { error: message };
      }
    },
    [refresh],
  );

  const handleRename = useCallback(
    async (locationId: string, newName: string, color: string): Promise<{ error?: string }> => {
      try {
        await renameLocation(locationId, newName, color);
        await refresh();
        return {};
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to rename location';
        return { error: message };
      }
    },
    [refresh],
  );

  const handleRemoveLocation = useCallback(
    async (locationId: string): Promise<{ error?: string }> => {
      try {
        await deleteLocation(locationId);
        await refresh();
        return {};
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove location';
        return { error: message };
      }
    },
    [refresh],
  );

  return (
    <div style={{ maxWidth: 800, margin: 'auto' }}>
      <h2>{t('Settings')}</h2>
      <section aria-label={t('Language')} style={{ marginTop: 16 }}>
        <h3>{t('Language')}</h3>
        <LanguageSwitcher inline />
      </section>
      <DisplaySettings />
      <details
        style={{
          marginTop: 16,
          padding: 12,
          border: '1px solid var(--color-border)',
          borderRadius: 10,
        }}
      >
        <summary style={{ minHeight: 44, cursor: 'pointer', fontWeight: 600 }}>
          {t('Storage locations')}
        </summary>
        {loading ? (
          <p role="status">{t('Loading…')}</p>
        ) : error ? (
          <div role="alert">
            <p>{message(error)}</p>
            <button onClick={refresh}>{t('Retry')}</button>
          </div>
        ) : (
          <StorageLocationManager
            locations={locations}
            onAdd={handleAddLocation}
            onRename={handleRename}
            onRemove={handleRemoveLocation}
          />
        )}
      </details>
    </div>
  );
}
