import React, { useEffect, useState } from 'react';
import { VALID_UNITS, getUnitLabel } from '../../types/units';
import { fetchLocations } from '../../api/locations/locations';
import type { StorageLocation } from '../../api/locations/locations';
import { DEPARTMENTS } from './departments';
import { readCompanion, safeProductLink } from './companion';
import type { ManualItem, ProductPreference, ShoppingLine } from './companion';
export interface ShoppingEditRequest {
  kind: 'manual' | 'preference';
  key: string;
  item?: ManualItem;
  line?: ShoppingLine;
}
const field: React.CSSProperties = { display: 'grid', gap: 6, margin: '14px 0' };
const input: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  borderRadius: 10,
  padding: 10,
  minHeight: 44,
  width: '100%',
  boxSizing: 'border-box',
};
export default function ShoppingEditPage({
  request,
  onBack,
}: {
  request: ShoppingEditRequest;
  onBack: () => void;
}) {
  const [initial] = useState(() => {
    try {
      return readCompanion(request.key);
    } catch {
      return null;
    }
  });
  const [manual, setManual] = useState<ManualItem>(
    request.item ?? {
      id: crypto.randomUUID(),
      name: '',
      quantity: 1,
      unit: 'piece',
      category: 'Other',
      store: '',
      notes: '',
    },
  );
  const [pref, setPref] = useState<ProductPreference>(
    initial?.preferences[request.line?.id ?? ''] ?? {},
  );
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [error, setError] = useState(
    initial ? '' : 'Saved shopping data could not be read. Return and retry before editing.',
  );
  useEffect(() => {
    let active = true;
    fetchLocations()
      .then((items) => {
        if (active) setLocations(items);
      })
      .catch(() => {
        if (active)
          setError('Storage locations unavailable. You can still save other preferences.');
      });
    return () => {
      active = false;
    };
  }, []);
  const stores = [
    ...new Set([
      'Carrefour',
      'Costco',
      'Mercadona',
      'Lidl',
      ...(initial?.manual.map((m) => m.store) ?? []),
      ...Object.values(initial?.preferences ?? {}).map((p) => p.store ?? ''),
    ]),
  ].filter(Boolean);
  function stringPref(
    label: string,
    key: 'store' | 'alternativeStore' | 'brand' | 'barcode' | 'link' | 'replacement',
  ) {
    return (
      <label style={field}>
        {label}
        <input
          style={input}
          value={pref[key] ?? ''}
          list={key.includes('Store') || key === 'store' ? 'shopping-stores' : undefined}
          onChange={(e) => setPref({ ...pref, [key]: e.target.value })}
        />
      </label>
    );
  }
  function numberPref(label: string, key: 'reserve' | 'packageSize' | 'packagePrice') {
    return (
      <label style={field}>
        {label}
        <input
          style={input}
          type="number"
          min={key === 'packageSize' ? '0.000001' : '0'}
          step="any"
          value={pref[key] ?? ''}
          onChange={(e) =>
            setPref({ ...pref, [key]: e.target.value === '' ? undefined : Number(e.target.value) })
          }
        />
      </label>
    );
  }
  return (
    <section
      style={{
        maxWidth: 660,
        margin: 'auto',
        padding: 20,
        background: 'var(--color-surface)',
        borderRadius: 18,
      }}
    >
      <button onClick={onBack}>Back to shopping list</button>
      <h2>
        {request.kind === 'manual'
          ? request.item
            ? 'Edit manual item'
            : 'Add something to buy'
          : `Product preferences: ${request.line?.name}`}
      </h2>
      <datalist id="shopping-stores">
        {stores.map((store) => (
          <option key={store} value={store} />
        ))}
      </datalist>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const state = readCompanion(request.key);
            if (request.kind === 'manual') {
              if (
                !manual.name.trim() ||
                !Number.isFinite(manual.quantity) ||
                manual.quantity <= 0
              ) {
                setError('Enter a name and positive quantity.');
                return;
              }
              const value = { ...manual, name: manual.name.trim(), store: manual.store.trim() };
              state.manual = request.item
                ? state.manual.map((m) => (m.id === value.id ? value : m))
                : [...state.manual, value];
            } else if (request.line) {
              if (pref.link && !safeProductLink(pref.link)) {
                setError('Use an http or https product link.');
                return;
              }
              if (pref.packageSize !== undefined && pref.packageSize <= 0) {
                setError('Package size must be positive.');
                return;
              }
              state.preferences[request.line.id] = pref;
            }
            localStorage.setItem(request.key, JSON.stringify(state));
            onBack();
          } catch {
            setError('Changes could not be saved. Keep this page open and try again.');
          }
        }}
      >
        {request.kind === 'manual' ? (
          <>
            <label style={field}>
              Item name
              <input
                style={input}
                required
                value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })}
              />
            </label>
            <label style={field}>
              Quantity
              <input
                style={input}
                type="number"
                min="0.000001"
                step="any"
                required
                value={manual.quantity}
                onChange={(e) => setManual({ ...manual, quantity: Number(e.target.value) })}
              />
            </label>
            <label style={field}>
              Unit
              <select
                style={input}
                value={manual.unit}
                onChange={(e) => setManual({ ...manual, unit: e.target.value })}
              >
                {VALID_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {getUnitLabel(u, 1)}
                  </option>
                ))}
              </select>
            </label>
            <label style={field}>
              Supermarket department
              <select
                style={input}
                value={manual.category}
                onChange={(e) => setManual({ ...manual, category: e.target.value })}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label style={field}>
              Where to buy
              <input
                style={input}
                list="shopping-stores"
                placeholder="Any store"
                value={manual.store}
                onChange={(e) => setManual({ ...manual, store: e.target.value })}
              />
            </label>
            <label style={field}>
              Notes
              <textarea
                style={input}
                value={manual.notes}
                onChange={(e) => setManual({ ...manual, notes: e.target.value })}
              />
            </label>
          </>
        ) : (
          <>
            <p>
              Saved for this product on this device. Leave a field blank to use its
              inventory/default value.
            </p>
            {stringPref('Preferred store', 'store')}
            {stringPref('Alternative store', 'alternativeStore')}
            {stringPref('Usual brand', 'brand')}
            {stringPref('Barcode', 'barcode')}
            {stringPref('Product link', 'link')}
            <label style={field}>
              Supermarket department
              <select
                style={input}
                value={pref.department ?? request.line?.department}
                onChange={(e) =>
                  setPref({
                    ...pref,
                    department: e.target.value as ProductPreference['department'],
                  })
                }
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label style={field}>
              Usual storage location
              <select
                style={input}
                value={pref.locationId ?? ''}
                onChange={(e) => setPref({ ...pref, locationId: e.target.value })}
              >
                <option value="">Use inventory default</option>
                {locations.map((l) => (
                  <option key={l.locationId} value={l.locationId}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            {request.line?.id.startsWith('group:') &&
              numberPref(`Desired stock after meals (${request.line.unit})`, 'reserve')}
            {numberPref('Package size', 'packageSize')}
            <label style={field}>
              Package unit
              <select
                style={input}
                value={pref.packageUnit ?? request.line?.unit}
                onChange={(e) => setPref({ ...pref, packageUnit: e.target.value })}
              >
                {VALID_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {getUnitLabel(u, 1)}
                  </option>
                ))}
              </select>
            </label>
            {numberPref('Estimated price per package (€)', 'packagePrice')}
            <label style={{ ...field, display: 'flex', alignItems: 'center', minHeight: 44 }}>
              <input
                type="checkbox"
                checked={pref.substitute ?? false}
                onChange={(e) => setPref({ ...pref, substitute: e.target.checked })}
              />
              Allow substitutions in order plans
            </label>
            {stringPref('Preferred replacement', 'replacement')}
          </>
        )}
        <button
          type="submit"
          disabled={!initial}
          style={{ ...input, background: 'var(--color-mint)' }}
        >
          Save {request.kind === 'manual' ? 'manual item' : 'preferences'}
        </button>
      </form>
    </section>
  );
}
