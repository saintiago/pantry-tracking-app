import React, { useEffect, useState } from 'react';
import { fetchLocations } from '../../api/locations/locations';
import type { StorageLocation } from '../../api/locations/locations';
import { addInventoryItem } from '../../api/inventory/inventory';
import { readState } from '../ShoppingListPage/shopping';

export interface PurchaseRequest {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  storageKey: string;
}
const control: React.CSSProperties = {
  minHeight: 44,
  padding: '10px 12px',
  border: '1px solid #d9cfdf',
  borderRadius: 10,
  font: 'inherit',
  boxSizing: 'border-box',
  width: '100%',
};

export default function PurchasePage({
  purchase,
  onBack,
}: {
  purchase: PurchaseRequest;
  onBack: () => void;
}) {
  const [quantity, setQuantity] = useState(purchase.quantity > 0 ? String(purchase.quantity) : '');
  const [category, setCategory] = useState(purchase.category);
  const [expiration, setExpiration] = useState('');
  const [location, setLocation] = useState('');
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLocationError('');
    fetchLocations()
      .then((items) => {
        if (!cancelled) {
          setLocations(items);
          if (items.length === 1) setLocation(items[0].locationId);
        }
      })
      .catch(() => {
        if (!cancelled) setLocationError('Could not load storage locations.');
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);
  return (
    <section
      style={{ maxWidth: 560, margin: '0 auto', padding: 24, background: '#fff', borderRadius: 20 }}
    >
      <button
        style={{ ...control, width: 'auto', background: '#f6f0fa' }}
        disabled={saving}
        onClick={onBack}
      >
        Back to shopping list
      </button>
      <h2>Add purchases to inventory</h2>
      <p>
        {purchase.name} · {purchase.unit}
      </p>
      {done ? (
        <p role="status">Purchase added to inventory.{error && ` ${error}`}</p>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const actual = Number(quantity);
            if (
              !Number.isFinite(actual) ||
              actual <= 0 ||
              !category.trim() ||
              !location ||
              !expiration
            ) {
              setError(
                'Enter a positive quantity, category, storage location and expiration date.',
              );
              return;
            }
            setSaving(true);
            setError('');
            try {
              await addInventoryItem({
                name: purchase.name,
                category: category.trim(),
                unit: purchase.unit,
                quantity: actual,
                locationId: location,
                expirationDate: expiration,
              });
              setDone(true);
              try {
                const state = readState(purchase.storageKey);
                delete state.checked[purchase.id];
                delete state.extras[purchase.id];
                localStorage.setItem(purchase.storageKey, JSON.stringify(state));
              } catch {
                setError(
                  'The saved basket could not be cleared; untick this product when you return.',
                );
              }
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : 'Purchase could not be saved.');
            } finally {
              setSaving(false);
            }
          }}
        >
          <p>Confirm what you actually bought. This creates a new inventory lot.</p>
          <label style={{ display: 'block', marginBottom: 16 }}>
            Actual quantity ({purchase.unit})
            <input
              style={control}
              type="number"
              min="0.000000001"
              step="any"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 16 }}>
            Category
            <input
              style={control}
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 16 }}>
            Storage location
            <select
              style={control}
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">Select location</option>
              {locations.map((l) => (
                <option key={l.locationId} value={l.locationId}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {locationError && (
            <div role="alert">
              {locationError}
              <button type="button" style={control} onClick={() => setReload((n) => n + 1)}>
                Retry locations
              </button>
            </div>
          )}
          {!locationError && !locations.length && (
            <p>Add a storage location in Inventory if you do not have one yet.</p>
          )}
          <label style={{ display: 'block', marginBottom: 16 }}>
            Expiration date
            <input
              style={control}
              type="date"
              required
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button style={{ ...control, background: '#e0ebdf' }} disabled={saving} type="submit">
            {saving ? 'Adding…' : 'Add purchase'}
          </button>
        </form>
      )}
    </section>
  );
}
