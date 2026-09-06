import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext/AuthContext';
import { fetchShoppingData } from '../../api/shopping-list/shopping-list';
import { addDays, getWeekStart } from '../MealPlanPage/weekUtils';
import {
  amount,
  baseUnit,
  calculateShopping,
  emptyState,
  localToday,
  normalize,
  readState,
  storageKey,
} from './shopping';
import type { ShoppingData, ShoppingState } from './shopping';
import {
  buildLines,
  companionKey,
  emptyCompanion,
  isDeferred,
  packageSuggestion,
  purchaseCadence,
  readCompanion,
  safeProductLink,
  shoppingInventory,
} from './companion';
import type { CompanionState, ManualItem, ShoppingLine } from './companion';
import ShoppingRows, {
  action as button,
  card as panel,
  rowWrap as wrap,
  small as muted,
  lineChecked,
} from './ShoppingRows';
import type { ShoppingEditRequest } from './ShoppingEditPage';
import type { PurchaseRequest } from '../PurchasePage/PurchasePage';
const input: React.CSSProperties = { ...button, width: '100%', boxSizing: 'border-box' };
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
const filterStyle = (selected: boolean): React.CSSProperties => ({
  ...button,
  background: selected ? 'var(--color-mint)' : 'var(--color-surface)',
});
interface ShoppingView {
  start: string;
  weeks: number;
  days: string[];
  recipes: string[];
  past: boolean;
  showStock: boolean;
  search: string;
  mode: 'planning' | 'shopping' | 'order';
  store: string;
}
// Preserve the trip while visiting purchase/preferences pages in this session.
const views = new Map<string, ShoppingView>();
export default function ShoppingListPage({
  onPurchase,
  onEdit,
}: {
  onPurchase: (purchase: PurchaseRequest) => void;
  onEdit: (request: ShoppingEditRequest) => void;
}) {
  const { user } = useAuth();
  const today = localToday();
  const currentWeek = getWeekStart(new Date(`${today}T12:00:00Z`));
  const view = views.get(user!.userId);
  const [start, setStart] = useState(view?.start ?? currentWeek);
  const [weeks, setWeeks] = useState(view?.weeks ?? 1);
  const end = addDays(start, weeks * 7 - 1);
  const key = storageKey(user!.userId, start, end);
  const globalKey = companionKey(user!.userId);
  const [days, setDays] = useState<string[]>(view?.days ?? []);
  const [recipes, setRecipes] = useState<string[]>(view?.recipes ?? []);
  const [past, setPast] = useState(view?.past ?? false);
  const [showStock, setShowStock] = useState(view?.showStock ?? false);
  const [search, setSearch] = useState(view?.search ?? '');
  const [mode, setMode] = useState<'planning' | 'shopping' | 'order'>(view?.mode ?? 'planning');
  const [store, setStore] = useState(view?.store ?? '');
  useEffect(() => {
    views.set(user!.userId, { start, weeks, days, recipes, past, showStock, search, mode, store });
  }, [user, start, weeks, days, recipes, past, showStock, search, mode, store]);
  const [copyMessage, setCopyMessage] = useState('');
  const [removed, setRemoved] = useState<ManualItem | null>(null);
  const [initial] = useState(() => {
    try {
      return { state: readCompanion(globalKey), error: '' };
    } catch {
      return {
        state: emptyCompanion(),
        error:
          'Saved shopping companion data could not be read. Try reloading before making changes.',
      };
    }
  });
  const [companion, setCompanion] = useState(initial.state);
  const [storageError, setStorageError] = useState(initial.error);
  const [snapshot, setSnapshot] = useState<{
    start: string;
    end: string;
    data: ShoppingData;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [saved, setSaved] = useState<{ key: string; state: ShoppingState }>({
    key: '',
    state: emptyState(),
  });
  const state = saved.key === key ? saved.state : emptyState();
  const request = useRef(0);
  useEffect(() => {
    try {
      setSaved({ key, state: readState(key) });
    } catch {
      setSaved({ key, state: emptyState() });
      setStorageError('Saved basket could not be read.');
    }
  }, [key]);
  function update(next: CompanionState) {
    if (initial.error) {
      setStorageError(initial.error);
      return;
    }
    setCompanion(next);
    try {
      localStorage.setItem(globalKey, JSON.stringify(next));
      setStorageError('');
    } catch {
      setStorageError('Shopping changes could not be saved on this device. Keep this tab open.');
    }
  }
  function save(next: ShoppingState) {
    setSaved({ key, state: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStorageError('');
    } catch {
      setStorageError(
        'Basket could not be saved on this device. Keep this tab open to retain changes.',
      );
    }
  }
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState !== 'hidden') setRefresh((n) => n + 1);
    };
    window.addEventListener('focus', reload);
    window.addEventListener('online', reload);
    return () => {
      window.removeEventListener('focus', reload);
      window.removeEventListener('online', reload);
    };
  }, []);
  useEffect(() => {
    const id = ++request.current;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError('');
    fetchShoppingData(start, end, controller.signal)
      .then((data) => {
        if (id === request.current) setSnapshot({ start, end, data });
      })
      .catch((err: unknown) => {
        if (id === request.current)
          setError(
            err instanceof Error && err.name !== 'AbortError'
              ? err.message
              : 'Shopping list request timed out. Please retry.',
          );
      })
      .finally(() => {
        clearTimeout(timer);
        if (id === request.current) setLoading(false);
      });
    return () => {
      request.current++;
      clearTimeout(timer);
      controller.abort();
    };
  }, [start, end, refresh]);
  const data = useMemo(
    () =>
      snapshot?.start === start && snapshot.end === end
        ? shoppingInventory(snapshot.data, companion)
        : null,
    [snapshot, start, end, companion],
  );
  const eligible = useMemo(
    () =>
      (data?.plans ?? []).filter(
        (p) => p.date >= start && p.date <= end && (past || p.date >= today),
      ),
    [data, start, end, past, today],
  );
  const selected = eligible.filter(
    (p) =>
      (!days.length || days.includes(p.date)) && (!recipes.length || recipes.includes(p.recipeId)),
  );
  const result = data ? calculateShopping(data, selected, today) : null;
  const lines = data && result ? buildLines(data, result, companion, today, key) : [];
  const recipeOptions = (data?.recipes ?? [])
    .filter((r) => eligible.some((p) => p.recipeId === r.recipeId))
    .sort((a, b) => a.name.localeCompare(b.name));
  const toggle = (values: string[], value: string) =>
    values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
  function period(next: string, count = weeks) {
    setStart(next);
    setWeeks(count);
    setDays([]);
    setRecipes([]);
  }
  // Keep the unpurchased generated requirement, not a duplicate of manual entries.
  const carrySnapshot = JSON.stringify(
    lines
      .filter((l) => !l.carried && (l.meal || l.sources.includes('Restock')))
      .map((line) => {
        const manualQuantity = companion.manual
          .filter((m) => line.manualIds.includes(m.id))
          .reduce((sum, m) => sum + m.quantity * baseUnit(m.unit).factor, 0);
        return {
          ...line,
          quantity: Math.max(0, line.quantity - manualQuantity),
          manualIds: [],
          sources: line.sources.filter((s) => s !== 'Manual'),
          carryPeriod: key,
        };
      }),
  );
  useEffect(() => {
    if (!data || loading || error || initial.error) return;
    const current: ShoppingLine[] = JSON.parse(carrySnapshot);
    const carry = { ...companion.carry };
    for (const line of current) {
      if (line.quantity > 0) carry[line.id] = line;
      else delete carry[line.id];
    }
    for (const line of Object.values(carry)) {
      if (
        line.carryPeriod === key &&
        line.meal &&
        !line.meal.contributions.some((c) => data.plans.some((p) => p.planId === c.planId))
      )
        delete carry[line.id];
    }
    if (JSON.stringify(carry) !== JSON.stringify(companion.carry)) update({ ...companion, carry });
  }, [carrySnapshot, loading, error, key]);
  function check(line: ShoppingLine) {
    const checked = { ...state.checked };
    if (lineChecked(line, state)) delete checked[line.id];
    else
      checked[line.id] = {
        quantity: line.quantity,
        plans: line.meal?.contributions.map((c) => c.planId) ?? [],
        unknown: line.unknown,
      };
    save({ ...state, checked });
  }
  function purchase(line: ShoppingLine) {
    const pref = companion.preferences[line.id] ?? {};
    const pack = packageSuggestion(line.quantity, line.unit, pref);
    const group = data?.groups.find((g) => `group:${g.groupId}` === line.id);
    const lot = data?.items.find((i) => `group:${i.groupId}` === line.id);
    const unit = group?.unit ?? line.unit;
    onPurchase({
      id: line.id,
      name: line.name,
      category: group?.category ?? line.category,
      unit,
      quantity: (pack?.quantity ?? line.quantity) / baseUnit(unit).factor,
      storageKey: key,
      companionKey: globalKey,
      line,
      prefill: {
        brand: pref.brand ?? lot?.brand,
        barcode: pref.barcode ?? lot?.barcode,
        whereToBuy: line.store === 'Any store' ? '' : line.store,
        onlineStoreLink: safeProductLink(pref.link ?? lot?.onlineStoreLink),
        locationId: pref.locationId ?? lot?.location,
        locationDetails: lot?.locationDetails,
        pictureUrl: lot?.pictureUrl,
      },
    });
  }
  function renderList(
    title: string,
    list: ShoppingLine[],
    listMode: 'meal' | 'low' | 'manual' | 'shopping' | 'pending',
  ) {
    return (
      <ShoppingRows
        title={title}
        lines={list}
        mode={listMode}
        companion={companion}
        basket={state}
        disabled={loading || !!error}
        today={today}
        period={key}
        onCheck={check}
        onPurchase={purchase}
        onPreferences={(line) => onEdit({ kind: 'preference', key: globalKey, line })}
        onEditManual={(id) =>
          onEdit({
            kind: 'manual',
            key: globalKey,
            item: companion.manual.find((m) => m.id === id),
          })
        }
        onRemoveManual={(id) => {
          setRemoved(companion.manual.find((m) => m.id === id) ?? null);
          update({ ...companion, manual: companion.manual.filter((m) => m.id !== id) });
        }}
        onUpdate={update}
      />
    );
  }
  const matches = (line: ShoppingLine) =>
    normalize(line.name).includes(normalize(search)) && (!store || line.store === store);
  const visible = lines.filter(matches);
  const active = visible.filter((l) => !isDeferred(companion, l.id, today, key));
  const deferred = visible.filter((l) => isDeferred(companion, l.id, today, key));
  const mealLines = active.filter(
    (l) => l.meal && !l.carried && (showStock || l.quantity > 0 || l.unknown),
  );
  const lowLines = active.filter((l) => l.sources.includes('Restock') && !l.carried);
  const manualLines = active.filter((l) => l.manualIds.length > 0);
  const shopLines = active.filter((l) => l.quantity > 0 || l.unknown);
  const basketLines = shopLines.filter((l) => lineChecked(l, state));
  const priced = shopLines.map((l) =>
    packageSuggestion(l.quantity, l.unit, companion.preferences[l.id] ?? {}),
  );
  const estimate = priced.reduce((sum, p) => sum + (p?.price ?? 0), 0);
  const missingPrices = priced.filter((p) => p?.price === undefined).length;
  return (
    <div style={{ maxWidth: 1100, margin: 'auto', color: 'var(--color-text)' }}>
      <div style={{ ...wrap, justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h2>Shopping List</h2>
          <p style={muted}>Plan it once. Shop with a clear list.</p>
        </div>
        <button style={button} disabled={loading} onClick={() => setRefresh((n) => n + 1)}>
          Refresh
        </button>
      </div>
      <div style={{ ...wrap, marginBottom: 18 }}>
        {(['planning', 'shopping', 'order'] as const).map((value) => (
          <button
            key={value}
            style={filterStyle(mode === value)}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {value === 'planning'
              ? 'Planning lists'
              : value === 'shopping'
                ? 'Shopping mode'
                : 'Order preview'}
          </button>
        ))}
        <button style={button} onClick={() => onEdit({ kind: 'manual', key: globalKey })}>
          Add something to buy
        </button>
      </div>
      <section
        aria-label="Shopping filters"
        style={{ ...panel, background: 'var(--color-canvas)' }}
      >
        <div style={wrap}>
          <button
            aria-label="Previous week"
            style={{ ...button, padding: 0, width: 44, flexShrink: 0 }}
            onClick={() => period(addDays(start, -7))}
          >
            ←
          </button>
          <label style={{ flex: 1, minWidth: 0, maxWidth: 200 }}>
            Week of{' '}
            <input
              style={{ ...input, width: '100%', display: 'block' }}
              aria-label="Week of"
              type="date"
              value={start}
              onChange={(e) => {
                if (e.target.value) period(getWeekStart(new Date(`${e.target.value}T12:00:00Z`)));
              }}
            />
          </label>
          <button
            aria-label="Next week"
            style={{ ...button, padding: 0, width: 44, flexShrink: 0 }}
            onClick={() => period(addDays(start, 7))}
          >
            →
          </button>
        </div>
        <div style={{ ...wrap, marginTop: 10 }}>
          <button
            style={filterStyle(start === currentWeek && weeks === 1)}
            aria-pressed={start === currentWeek && weeks === 1}
            onClick={() => period(currentWeek, 1)}
          >
            This week
          </button>
          <button
            style={filterStyle(start === addDays(currentWeek, 7) && weeks === 1)}
            aria-pressed={start === addDays(currentWeek, 7) && weeks === 1}
            onClick={() => period(addDays(currentWeek, 7), 1)}
          >
            Next week only
          </button>
          <button
            style={filterStyle(start === currentWeek && weeks === 2)}
            aria-pressed={start === currentWeek && weeks === 2}
            onClick={() => period(currentWeek, 2)}
          >
            Both weeks
          </button>
        </div>
        <p>
          <strong>
            {dateLabel(start)} – {dateLabel(end)}
          </strong>
        </p>
        <details style={{ marginTop: 12 }}>
          <summary style={button}>
            Day and recipe filters
            {days.length || recipes.length
              ? ` · ${days.length || 'all'} days, ${recipes.length || 'all'} recipes`
              : ''}
          </summary>
          <label style={{ ...wrap, minHeight: 44 }}>
            <input
              type="checkbox"
              checked={past}
              onChange={(e) => {
                setPast(e.target.checked);
                setDays([]);
              }}
            />
            Include past days
          </label>
          <fieldset style={{ border: 0, padding: 0, margin: '12px 0' }}>
            <legend style={{ marginBottom: 8 }}>
              Days · {days.length ? `${days.length} selected` : 'All days'}
            </legend>
            <div style={wrap}>
              {Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
                .filter((d) => past || d >= today)
                .map((day) => (
                  <button
                    key={day}
                    style={{
                      ...button,
                      background: days.includes(day) ? 'var(--color-mint)' : 'var(--color-surface)',
                    }}
                    aria-pressed={days.includes(day)}
                    onClick={() => setDays(toggle(days, day))}
                  >
                    {dateLabel(day)}
                  </button>
                ))}
            </div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: '12px 0' }}>
            <legend style={{ marginBottom: 8 }}>
              Recipes · {recipes.length ? `${recipes.length} selected` : 'All recipes'}
            </legend>
            <div style={wrap}>
              {recipeOptions.map((recipe) => (
                <button
                  key={recipe.recipeId}
                  style={{
                    ...button,
                    background: recipes.includes(recipe.recipeId)
                      ? 'var(--color-mint)'
                      : 'var(--color-surface)',
                  }}
                  aria-pressed={recipes.includes(recipe.recipeId)}
                  onClick={() => setRecipes(toggle(recipes, recipe.recipeId))}
                >
                  {recipe.name}
                </button>
              ))}
            </div>
          </fieldset>
          <div style={wrap}>
            <button
              style={button}
              onClick={() => {
                setDays([]);
                setRecipes([]);
                setSearch('');
              }}
            >
              Clear filters
            </button>
            <label style={{ ...wrap, minHeight: 44 }}>
              <input
                type="checkbox"
                checked={showStock}
                onChange={(e) => setShowStock(e.target.checked)}
              />
              Show ingredients already in stock
            </label>
          </div>
        </details>
        <label style={{ display: 'block', marginTop: 12 }}>
          Search ingredients
          <input
            type="search"
            style={{ ...input, display: 'block', width: '100%', marginTop: 6 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </section>
      <label style={{ ...wrap, marginBottom: 16 }}>
        Store
        <select
          aria-label="Filter by store"
          style={button}
          value={store}
          onChange={(e) => setStore(e.target.value)}
        >
          <option value="">All stores</option>
          {[...new Set(lines.map((l) => l.store))].sort().map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {storageError && <p role="alert">{storageError}</p>}
      {loading && <p role="status">Updating shopping list…</p>}
      {error && (
        <div role="alert" style={panel}>
          <p>
            {error} {data ? 'Showing the last loaded list. Refresh before shopping.' : ''}
          </p>
          <button style={button} onClick={() => setRefresh((n) => n + 1)}>
            Retry shopping list
          </button>
        </div>
      )}
      {result?.warnings.map((warning) => (
        <p key={warning} role="alert">
          {warning}
        </p>
      ))}
      {removed && (
        <p role="status">
          Removed {removed.name}.{' '}
          <button
            style={button}
            onClick={() => {
              update({ ...companion, manual: [...companion.manual, removed] });
              setRemoved(null);
            }}
          >
            Undo removal
          </button>
        </p>
      )}
      {data && result && (
        <>
          {mode === 'planning' && (
            <>
              <p style={muted}>
                {selected.length} planned meals · quantities adjusted to your servings.
              </p>
              {renderList('Ingredients for planned meals', mealLines, 'meal')}
              {!mealLines.length && (
                <p style={{ ...muted, marginBottom: 18 }}>
                  {search
                    ? 'No ingredients match your search.'
                    : !selected.length
                      ? 'No meals planned for these filters.'
                      : result.warnings.length
                        ? 'Some planned recipes could not be calculated. Review the warning above.'
                        : 'Everything needed is in stock.'}
                </p>
              )}
              {renderList('Low-stock inventory', lowLines, 'low')}
              {!lowLines.length && (
                <p style={muted}>
                  {search ? 'No low-stock products match your search.' : 'No low-stock items.'}
                </p>
              )}
              {renderList('Other things to buy', manualLines, 'manual')}
              {!manualLines.length && (
                <p style={muted}>
                  Add manual items for any store. They stay on your list across weeks.
                </p>
              )}
              {active.some((l) => l.carried) &&
                renderList(
                  'Carried forward',
                  active.filter((l) => l.carried),
                  'pending',
                )}
            </>
          )}
          {mode === 'shopping' && (
            <>
              <p style={muted}>
                {shopLines.length} distinct products · {basketLines.length} in basket · one row per
                product across all three lists.
              </p>
              {renderList('Shopping by store', shopLines, 'shopping')}
              {!shopLines.length && <p>No outstanding products for these filters.</p>}
              {basketLines.length > 0 && (
                <button
                  style={{ ...button, background: 'var(--color-mint)' }}
                  disabled={loading || !!error}
                  onClick={() => purchase(basketLines[0])}
                >
                  Put purchases away ({basketLines.length})
                </button>
              )}
            </>
          )}
          {mode === 'order' && (
            <section aria-label="Order preview" style={panel}>
              <h3>Review your order plan</h3>
              <p style={muted}>
                A draft to help you order. Prices are your saved estimates, not live retailer
                prices. No order is submitted.
              </p>
              <div style={wrap}>
                <label>
                  Shopping budget (€)
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={companion.budget ?? ''}
                    onChange={(e) =>
                      update({
                        ...companion,
                        budget:
                          e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
                      })
                    }
                  />
                </label>
                <label>
                  Maximum delivery fee (€)
                  <input
                    style={input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={companion.deliveryBudget ?? ''}
                    onChange={(e) =>
                      update({
                        ...companion,
                        deliveryBudget:
                          e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
                      })
                    }
                  />
                </label>
              </div>
              <p>
                Known product estimate: €{estimate.toFixed(2)}
                {companion.deliveryBudget !== undefined
                  ? ` · including delivery allowance: €${(estimate + companion.deliveryBudget).toFixed(2)}`
                  : ''}
              </p>
              {missingPrices > 0 && (
                <p style={{ background: 'var(--color-warning)', padding: 10 }}>
                  {missingPrices} products have no package price. The total is incomplete.
                </p>
              )}
              {companion.budget !== undefined &&
                estimate + (companion.deliveryBudget ?? 0) > companion.budget && (
                  <p role="alert">This plan exceeds your shopping budget.</p>
                )}
              {[...new Set(shopLines.map((l) => l.store))].sort().map((s) => (
                <section key={s}>
                  <h4>{s}</h4>
                  {shopLines
                    .filter((l) => l.store === s)
                    .map((line) => {
                      const pref = companion.preferences[line.id] ?? {};
                      const link = safeProductLink(pref.link);
                      return (
                        <div
                          key={line.id}
                          style={{
                            padding: '12px 0',
                            borderBottom: '1px solid var(--color-border)',
                          }}
                        >
                          <strong>
                            {line.name} · {amount(line.quantity)} {line.unit}
                          </strong>
                          <p style={muted}>
                            {pref.substitute
                              ? `Substitutions allowed${pref.replacement ? `: ${pref.replacement}` : ''}`
                              : 'No substitutions'}
                          </p>
                          {link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer">
                              Open product at retailer
                            </a>
                          ) : (
                            <button
                              style={button}
                              onClick={() => onEdit({ kind: 'preference', key: globalKey, line })}
                            >
                              Add product link and package price
                            </button>
                          )}
                        </div>
                      );
                    })}
                </section>
              ))}
              <button
                style={{ ...button, marginTop: 14 }}
                onClick={async () => {
                  const text = shopLines
                    .map(
                      (l) =>
                        `${l.store} / ${l.department}: ${l.name} — ${amount(l.quantity)} ${l.unit}`,
                    )
                    .join('\n');
                  try {
                    await navigator.clipboard.writeText(text);
                    setCopyMessage('Shopping list copied.');
                  } catch {
                    setCopyMessage('Copy is unavailable. Select the text below to copy it.');
                  }
                }}
              >
                Copy shopping list
              </button>
              {copyMessage && <p role="status">{copyMessage}</p>}
              <textarea
                aria-label="Shopping list text"
                readOnly
                value={shopLines
                  .map(
                    (l) =>
                      `${l.store} / ${l.department}: ${l.name} — ${amount(l.quantity)} ${l.unit}`,
                  )
                  .join('\n')}
                style={{ ...input, marginTop: 12, minHeight: 120 }}
              />
            </section>
          )}
          {deferred.length > 0 && renderList('Later and unavailable', deferred, 'pending')}
          <details style={panel}>
            <summary style={{ minHeight: 44, cursor: 'pointer' }}>
              Pantry reminders & purchase history
            </summary>
            {data.items
              .filter(
                (i) =>
                  i.quantity > 0 &&
                  i.expirationDate >= today &&
                  i.expirationDate <= addDays(today, 3),
              )
              .map((i) => (
                <p
                  key={i.itemId}
                  style={{ ...muted, padding: 8, background: 'var(--color-warning)' }}
                >
                  Use {i.name} soon · expires {i.expirationDate}
                  {i.locationDetails ? ` · ${i.locationDetails}` : ''}
                </p>
              ))}
            {!data.items.some(
              (i) =>
                i.quantity > 0 &&
                i.expirationDate >= today &&
                i.expirationDate <= addDays(today, 3),
            ) && <p style={muted}>No recorded stock expires in the next three days.</p>}
            {purchaseCadence(companion.history).map((pattern) => (
              <p key={pattern.id} style={muted}>
                {pattern.name}: bought about every {pattern.interval} days across {pattern.count}{' '}
                purchase dates. This is a shopping-history reminder; check your current stock before
                adding more.
              </p>
            ))}
            {companion.history
              .slice(-10)
              .reverse()
              .map((h, i) => (
                <p key={`${h.date}-${i}`} style={muted}>
                  {h.name} · {amount(h.quantity)} {h.unit} · {new Date(h.date).toLocaleDateString()}
                </p>
              ))}
            {!companion.history.length && (
              <p style={muted}>Purchases added through this tab will appear here.</p>
            )}
          </details>
        </>
      )}
      <p style={{ ...muted, margin: '12px 0 24px' }}>
        Lists and preferences are saved for your account on this device. Checking an item does not
        change inventory. Actual ordering and receipt import require future retailer integrations.
      </p>
    </div>
  );
}
