import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React, { useState } from 'react';

export interface StorageLocation {
  locationId: string;
  name: string;
  createdAt: string;
}

export interface StorageLocationManagerProps {
  locations: StorageLocation[];
  onAdd: (name: string) => Promise<{ error?: string }>;
  onRename: (locationId: string, newName: string) => Promise<{ error?: string }>;
  onRemove: (locationId: string) => Promise<{ error?: string }>;
}

const StorageLocationManager: React.FC<StorageLocationManagerProps> = ({
  locations,
  onAdd,
  onRename,
  onRemove,
}) => {
  useLanguage();
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setAddError('Location name cannot be empty.');
      return;
    }
    const duplicate = locations.some((l) => l.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      setAddError('A location with this name already exists.');
      return;
    }
    setAddError('');
    const result = await onAdd(trimmed);
    if (result.error) {
      setAddError(result.error);
    } else {
      setNewName('');
    }
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  const startEditing = (loc: StorageLocation) => {
    setEditingId(loc.locationId);
    setEditName(loc.name);
    setEditError('');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditError('');
  };

  const handleRename = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError('Location name cannot be empty.');
      return;
    }
    const duplicate = locations.some(
      (l) => l.locationId !== editingId && l.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      setEditError('A location with this name already exists.');
      return;
    }
    setEditError('');
    const result = await onRename(editingId, trimmed);
    if (result.error) {
      setEditError(result.error);
    } else {
      setEditingId(null);
      setEditName('');
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const handleRemove = async (locationId: string) => {
    setDeleteError('');
    const result = await onRemove(locationId);
    if (result.error) {
      setDeleteError(result.error);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(null);
    }
  };

  return (
    <section aria-label={t('Storage Locations')} style={styles.container}>
      <h3 style={styles.heading}>{t('Storage Locations')}</h3>

      {/* Add location form */}
      <div style={styles.addRow}>
        <input
          type="text"
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            if (addError) setAddError('');
          }}
          onKeyDown={handleAddKeyDown}
          placeholder={t('New location name')}
          aria-label={t('New location name')}
          style={styles.input}
        />
        <button onClick={handleAdd} aria-label={t('Add location')} style={styles.addButton}>
          {t('Add')}{' '}
        </button>
      </div>
      {addError && (
        <p role="alert" style={styles.errorText}>
          {translateMessage(addError)}
        </p>
      )}

      {/* Location list */}
      <ul style={styles.list} aria-label={t('Locations list')}>
        {locations.map((loc) => (
          <li key={loc.locationId} style={styles.listItem}>
            {editingId === loc.locationId ? (
              <div style={styles.editRow}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    if (editError) setEditError('');
                  }}
                  onKeyDown={handleRenameKeyDown}
                  aria-label={t('Rename {0}', loc.name)}
                  autoFocus
                  style={styles.input}
                />
                <button
                  onClick={handleRename}
                  aria-label={t('Save rename')}
                  style={styles.actionButton}
                >
                  {t('Save')}{' '}
                </button>
                <button
                  onClick={cancelEditing}
                  aria-label={t('Cancel rename')}
                  style={styles.actionButton}
                >
                  {t('Cancel')}{' '}
                </button>
                {editError && (
                  <p role="alert" style={styles.errorText}>
                    {translateMessage(editError)}
                  </p>
                )}
              </div>
            ) : confirmDeleteId === loc.locationId ? (
              <div style={styles.confirmRow}>
                <span style={styles.locationName}>
                  {t('Delete "')}
                  {loc.name}
                  {t('"?')}
                </span>
                <button
                  onClick={() => handleRemove(loc.locationId)}
                  aria-label={t('Confirm delete {0}', loc.name)}
                  style={styles.dangerButton}
                >
                  {t('Yes, delete')}{' '}
                </button>
                <button
                  onClick={() => {
                    setConfirmDeleteId(null);
                    setDeleteError('');
                  }}
                  aria-label={t('Cancel delete')}
                  style={styles.actionButton}
                >
                  {t('No')}{' '}
                </button>
              </div>
            ) : (
              <div style={styles.locationRow}>
                <span style={styles.locationName}>{loc.name}</span>
                <div style={styles.actions}>
                  <button
                    onClick={() => startEditing(loc)}
                    aria-label={t('Rename {0}', loc.name)}
                    style={styles.actionButton}
                  >
                    {t('Rename')}{' '}
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDeleteId(loc.locationId);
                      setDeleteError('');
                    }}
                    aria-label={t('Delete {0}', loc.name)}
                    style={styles.actionButton}
                  >
                    {t('Delete')}{' '}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {deleteError && (
        <p role="alert" style={styles.errorText}>
          {translateMessage(deleteError)}
        </p>
      )}
    </section>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '1rem',
    maxWidth: 480,
  },
  heading: {
    fontSize: '1.125rem',
    fontWeight: 700,
    marginBottom: '0.75rem',
  },
  addRow: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  input: {
    flex: 1,
    minHeight: 44,
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    outline: 'none',
  },
  addButton: {
    minWidth: 44,
    minHeight: 44,
    padding: '0.5rem 1rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-mint)',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: '0.75rem 0 0',
  },
  listItem: {
    borderBottom: '1px solid var(--color-border)',
    padding: '0.5rem 0',
  },
  locationRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  locationName: {
    fontSize: '1rem',
    flex: 1,
  },
  actions: {
    display: 'flex',
    gap: '0.25rem',
  },
  actionButton: {
    minWidth: 44,
    minHeight: 44,
    padding: '0.375rem 0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-canvas)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    cursor: 'pointer',
  },
  dangerButton: {
    minWidth: 44,
    minHeight: 44,
    padding: '0.375rem 0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-danger)',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  editRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    alignItems: 'center',
  },
  confirmRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    minHeight: 44,
  },
  errorText: {
    color: 'var(--color-danger-text)',
    fontSize: '0.875rem',
    margin: '0.25rem 0 0',
  },
};

export default StorageLocationManager;
