import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React, { useState } from 'react';

export interface StorageLocation {
  locationId: string;
  name: string;
  color?: string;
  createdAt: string;
}

export interface StorageLocationManagerProps {
  locations: StorageLocation[];
  onAdd: (name: string, color: string) => Promise<{ error?: string }>;
  onRename: (locationId: string, newName: string, color: string) => Promise<{ error?: string }>;
  onRemove: (locationId: string) => Promise<{ error?: string }>;
}

export const LOCATION_COLORS = [
  '#E3F0D5',
  '#E1F1FA',
  '#FFF2CE',
  '#F8DEDC',
  '#EDE3F3',
  '#DFF0EA',
  '#F3E3CA',
  '#E3E9FA',
] as const;

const StorageLocationManager: React.FC<StorageLocationManagerProps> = ({
  locations,
  onAdd,
  onRename,
  onRemove,
}) => {
  useLanguage();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(LOCATION_COLORS[0]);
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(LOCATION_COLORS[0]);
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
    const result = await onAdd(trimmed, newColor);
    if (result.error) {
      setAddError(result.error);
    } else {
      setNewName('');
      setNewColor(LOCATION_COLORS[locations.length % LOCATION_COLORS.length]);
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
    setEditColor(loc.color ?? LOCATION_COLORS[0]);
    setEditError('');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditColor(LOCATION_COLORS[0]);
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
    const result = await onRename(editingId, trimmed, editColor);
    if (result.error) {
      setEditError(result.error);
    } else {
      setEditingId(null);
      setEditName('');
      setEditColor(LOCATION_COLORS[0]);
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
      <p style={styles.helpText}>
        {t(
          'Use locations for places like Pantry, Fridge or Freezer. Colors make item location tags easier to scan.',
        )}
      </p>

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
        <ColorSelect value={newColor} onChange={setNewColor} label={t('New location color')} />
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
                <ColorSelect
                  value={editColor}
                  onChange={setEditColor}
                  label={t('Color for {0}', loc.name)}
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
                <span style={styles.locationName}>
                  <span
                    style={{
                      ...styles.swatch,
                      backgroundColor: loc.color ?? LOCATION_COLORS[0],
                    }}
                    aria-hidden="true"
                  />
                  {loc.name}
                </span>
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

function ColorSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label style={styles.colorLabel}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={styles.colorSelect}
      >
        {LOCATION_COLORS.map((color, index) => (
          <option key={color} value={color}>
            {t('Color {0}', index + 1)}
          </option>
        ))}
      </select>
    </label>
  );
}

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
    flexWrap: 'wrap',
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
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
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
  helpText: {
    color: 'var(--color-secondary)',
    fontSize: '0.9375rem',
    marginTop: 0,
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 6,
    border: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  colorLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: '0.8125rem',
    color: 'var(--color-secondary)',
  },
  colorSelect: {
    minHeight: 44,
    padding: '0.5rem',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    backgroundColor: 'var(--color-surface)',
  },
};

export default StorageLocationManager;
