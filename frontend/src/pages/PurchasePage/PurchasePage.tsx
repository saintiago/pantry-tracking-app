import { getUnitLabel } from '../../types/units';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React, { useEffect, useState } from 'react';
import { fetchLocations } from '../../api/locations/locations';
import type { StorageLocation } from '../../api/locations/locations';
import { addInventoryItem } from '../../api/inventory/inventory';
import AddItemPage from '../AddItemPage/AddItemPage';
import type { AddItemData } from '../AddItemPage/AddItemPage';
import { baseUnit, readState, amount } from '../ShoppingListPage/shopping';
import { completePurchase, readCompanion } from '../ShoppingListPage/companion';
import type { ShoppingLine } from '../ShoppingListPage/companion';

export interface PurchaseRequest {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  storageKey: string;
  companionKey?: string;
  line?: ShoppingLine;
  prefill?: Partial<AddItemData>;
}
export default function PurchasePage({
  purchase,
  onBack,
}: {
  purchase: PurchaseRequest;
  onBack: () => void;
}) {
  useLanguage();
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [done, setDone] = useState(false);
  const [covered, setCovered] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchLocations()
      .then((items) => {
        if (!cancelled) setLocations(items);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load storage locations.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);
  async function submit(actual: AddItemData): Promise<{ error?: string }> {
    if (actual.quantity <= 0) return { error: 'Enter a positive purchased quantity.' };
    const original = baseUnit(purchase.line?.unit ?? purchase.unit);
    const selected = baseUnit(actual.unit);
    let fulfilled = (actual.quantity * selected.factor) / original.factor;
    if (original.unit !== selected.unit) {
      fulfilled = Number(covered);
      if (!covered || !Number.isFinite(fulfilled) || fulfilled <= 0)
        return {
          error: 'Units differ. Enter how much of the shopping requirement this purchase covers.',
        };
    }
    let purchasedItemId: string | undefined;
    try {
      const { pictureFile, ...data } = actual;
      if (pictureFile) {
        if (
          pictureFile.size > 250000 ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(pictureFile.type)
        )
          return { error: 'Use a JPG, PNG or WebP photo smaller than 250 KB.' };
        data.pictureUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(pictureFile);
        });
      }
      const response = await addInventoryItem(data as unknown as Record<string, unknown>);
      purchasedItemId = response.item.itemId;
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Purchase could not be saved.' };
    }
    // The inventory mutation succeeded. Never repeat it if local persistence fails.
    setDone(true);
    try {
      const basket = readState(purchase.storageKey);
      delete basket.checked[purchase.id];
      delete basket.extras[purchase.id];
      localStorage.setItem(purchase.storageKey, JSON.stringify(basket));
      if (purchase.companionKey && purchase.line) {
        const state = readCompanion(purchase.companionKey);
        const next = completePurchase(
          state,
          purchase.line,
          fulfilled,
          actual,
          new Date().toISOString(),
        );
        if (
          purchasedItemId &&
          (original.unit !== selected.unit ||
            actual.name.trim().toLowerCase() !== purchase.name.trim().toLowerCase())
        ) {
          next.mappings = {
            ...next.mappings,
            [purchasedItemId]: {
              name: purchase.line.name,
              groupId: purchase.id.startsWith('group:') ? purchase.id.slice(6) : undefined,
              unit: purchase.line.unit,
              purchasedUnit: actual.unit,
              ratio: fulfilled / actual.quantity,
            },
          };
        }
        const old = next.preferences[purchase.id] ?? {};
        next.preferences[purchase.id] = {
          ...old,
          store: actual.whereToBuy ?? old.store,
          brand: actual.brand ?? old.brand,
          barcode: actual.barcode ?? old.barcode,
          link: actual.onlineStoreLink ?? old.link,
          locationId: actual.locationId,
        };
        localStorage.setItem(purchase.companionKey, JSON.stringify(next));
      }
    } catch {
      setError(
        'Purchase saved, but the shopping list could not be updated on this device. Review its remaining quantities.',
      );
    }
    return {};
  }
  if (done)
    return (
      <section style={{ maxWidth: 650, margin: 'auto', padding: 24 }}>
        <h2>{t('Purchase added to inventory')}</h2>
        <p role="status">
          {t('Saved successfully. Any remaining quantity stays on your shopping list.')}
        </p>
        {error && <p role="alert">{translateMessage(error)}</p>}
        <button onClick={onBack}>{t('Back to shopping list')}</button>
      </section>
    );
  if (loading) return <p role="status">{t('Loading storage locations…')}</p>;
  if (error)
    return (
      <section>
        <p role="alert">{translateMessage(error)}</p>
        <button onClick={() => setRetry((n) => n + 1)}>{t('Retry locations')}</button>
        <button onClick={onBack}>{t('Back to shopping list')}</button>
      </section>
    );
  return (
    <>
      <p style={{ maxWidth: 650, margin: '16px auto' }}>
        {t('Shopping requirement:')} {amount(purchase.line?.quantity ?? purchase.quantity)}{' '}
        {getUnitLabel(purchase.line?.unit ?? purchase.unit, 1)}
        {t('. Edit the actual product, quantity, unit and storage details below.')}{' '}
      </p>
      <details style={{ maxWidth: 650, margin: '16px auto' }}>
        <summary>{t('Changing between packages and ingredient units?')}</summary>
        <label>
          {t('Shopping quantity covered (')}
          {getUnitLabel(purchase.line?.unit ?? purchase.unit, 1)})
          <input
            aria-label={t('Shopping quantity covered')}
            type="number"
            min="0"
            step="any"
            value={covered}
            onChange={(e) => setCovered(e.target.value)}
          />
        </label>
        <p>
          {t(
            'Only needed for incompatible units, such as bottles and milliliters. Use the package label to enter the conversion.',
          )}{' '}
        </p>
      </details>
      <AddItemPage
        title={t('Add purchases to inventory')}
        submitText="Add purchase"
        backLabel="Back to shopping list"
        returnAfterSave={false}
        onBack={onBack}
        onSubmit={submit}
        locations={locations}
        prefillData={{
          name: purchase.name,
          category: purchase.category,
          unit: purchase.unit,
          quantity: purchase.quantity || undefined,
          ...purchase.prefill,
          locationId:
            purchase.prefill?.locationId ?? (locations.length === 1 ? locations[0].locationId : ''),
        }}
      />
    </>
  );
}
