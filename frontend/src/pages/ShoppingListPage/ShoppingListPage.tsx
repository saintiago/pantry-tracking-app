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
  needsReview,
  normalize,
  readState,
  storageKey,
} from './shopping';
import type { ShoppingData, ShoppingRow, ShoppingState, LowStockRow } from './shopping';
import type { PurchaseRequest } from '../PurchasePage/PurchasePage';

const panel: React.CSSProperties = {
  padding: 20,
  background: '#fff',
  border: '1px solid #e5dedf',
  borderRadius: 20,
  marginBottom: 18,
};
const wrap: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
};
const button: React.CSSProperties = {
  padding: '10px 14px',
  minHeight: 44,
  border: '1px solid #d9cfdf',
  borderRadius: 12,
  background: '#f6f0fa',
  color: '#47394f',
  cursor: 'pointer',
  font: 'inherit',
};
const input: React.CSSProperties = {
  ...button,
  background: '#fff',
  maxWidth: '100%',
  boxSizing: 'border-box',
};
const muted: React.CSSProperties = { color: '#655e67', fontSize: 13, lineHeight: 1.6 };
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

export default function ShoppingListPage({
  onPurchase,
}: {
  onPurchase: (purchase: PurchaseRequest) => void;
}) {
  const { user } = useAuth();
  const today = localToday();
  const currentWeek = getWeekStart(new Date(`${today}T12:00:00Z`));
  const [start, setStart] = useState(currentWeek);
  const [weeks, setWeeks] = useState(1);
  const end = addDays(start, weeks * 7 - 1);
  const [days, setDays] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<string[]>([]);
  const [past, setPast] = useState(false);
  const [showStock, setShowStock] = useState(false);
  const [search, setSearch] = useState('');
  const [snapshot, setSnapshot] = useState<{
    start: string;
    end: string;
    data: ShoppingData;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [storageError, setStorageError] = useState('');
  const key = storageKey(user!.userId, start, end);
  const [saved, setSaved] = useState<{ key: string; state: ShoppingState }>({
    key: '',
    state: emptyState(),
  });
  const state = saved.key === key ? saved.state : emptyState();
  const request = useRef(0);
  useEffect(() => {
    try {
      setSaved({ key, state: readState(key) });
      setStorageError('');
    } catch {
      setSaved({ key, state: emptyState() });
      setStorageError('Saved basket could not be read. Changes will be kept for this visit.');
    }
  }, [key]);
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
  const data = snapshot?.start === start && snapshot.end === end ? snapshot.data : null;
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
  function total(id: string, row?: ShoppingRow) {
    return (row?.buy ?? 0) + (state.extras[id] ?? 0);
  }
  function checked(id: string, row?: ShoppingRow) {
    return !!state.checked[id] && !needsReview(state.checked[id], total(id, row), row);
  }
  function checkbox(id: string, name: string, row?: ShoppingRow) {
    return (
      <label style={{ ...wrap, minHeight: 44, cursor: 'pointer', flexWrap: 'nowrap' }}>
        <input
          type="checkbox"
          aria-label={`In basket: ${name}`}
          checked={checked(id, row)}
          disabled={loading || !!error}
          style={{ width: 22, height: 22, accentColor: '#66846a', flexShrink: 0 }}
          onChange={() => {
            const next = { ...state.checked };
            if (checked(id, row)) delete next[id];
            else
              next[id] = {
                quantity: total(id, row),
                plans: row?.contributions.map((c) => c.planId) ?? [],
                unknown: row?.unknown ?? false,
              };
            save({ ...state, checked: next });
          }}
        />
        <strong style={{ overflowWrap: 'anywhere' }}>{name}</strong>
      </label>
    );
  }
  function references(row?: ShoppingRow) {
    if (!row) return <div style={muted}>General restock</div>;
    const refs = [...new Map(row.contributions.map((c) => [c.planId, c])).values()];
    return (
      <div style={{ ...wrap, gap: 6 }}>
        {refs.map((c) => (
          <span
            key={c.planId}
            style={{
              ...muted,
              background: '#f1edf6',
              borderRadius: 8,
              padding: '4px 8px',
              overflowWrap: 'anywhere',
            }}
          >
            {c.recipeName} · {dateLabel(c.date)} · {c.mealType}
          </span>
        ))}
      </div>
    );
  }
  function purchase(id: string, name: string, unit: string, category: string, row?: ShoppingRow) {
    const group = data?.groups.find((g) => `group:${g.groupId}` === id);
    const purchaseUnit = group?.unit ?? unit;
    return (
      checked(id, row) && (
        <button
          style={button}
          disabled={loading || !!error}
          onClick={() =>
            onPurchase({
              id,
              name,
              unit: purchaseUnit,
              category,
              quantity: total(id, row) / baseUnit(purchaseUnit).factor,
              storageKey: key,
            })
          }
        >
          Add purchases to inventory
        </button>
      )
    );
  }
  function review(id: string, row?: ShoppingRow) {
    return (
      needsReview(state.checked[id], total(id, row), row) && (
        <p style={{ color: '#855014' }}>
          Needs review — the meals or quantity increased. Check the amount and tick again.
        </p>
      )
    );
  }
  function ingredient(row: ShoppingRow) {
    const low = result!.lowStock.some((r) => r.id === row.id);
    return (
      <article
        key={row.id}
        aria-label={`${row.name} meal ingredient`}
        style={{ padding: '16px 0', borderTop: '1px solid #eee7e8' }}
      >
        <div style={{ ...wrap, justifyContent: 'space-between' }}>
          {checkbox(row.id, row.name, row)}
          <strong style={{ color: '#436848' }}>
            {total(row.id, row) > 0
              ? `Buy ${amount(total(row.id, row))} ${row.unit}`
              : row.unknown
                ? 'Quantity to check'
                : 'In stock'}
          </strong>
        </div>
        <p style={muted}>
          Needed{' '}
          {row.unknown && row.needed === 0
            ? 'quantity to check'
            : `${amount(row.needed)} ${row.unit}`}{' '}
          · In inventory for these meals {amount(row.available)} {row.unit}
          {row.unknown ? ' · Quantity to check' : ''}
        </p>
        {references(row)}
        {low && (
          <p style={muted}>Also low stock · any extra below is included in the total to buy.</p>
        )}
        {row.warnings.map((warning) => (
          <p key={warning} style={{ ...muted, color: '#855014' }}>
            {warning}
          </p>
        ))}
        {review(row.id, row)}
        {purchase(row.id, row.name, row.unit, row.category, row)}
      </article>
    );
  }
  function lowStock(row: LowStockRow) {
    const threshold = baseUnit(row.group.thresholdUnit ?? row.group.unit);
    return (
      <article
        key={row.id}
        aria-label={`${row.group.name} low stock`}
        style={{ padding: '16px 0', borderTop: '1px solid #eee7e8' }}
      >
        {checkbox(row.id, row.group.name, row.meal)}
        <p style={muted}>
          In inventory {amount(row.stock)} {row.unit} · Low-stock threshold{' '}
          {amount((row.group.threshold ?? 0) * threshold.factor)} {threshold.unit}
        </p>
        {references(row.meal)}
        {row.meal && (
          <p style={muted}>
            Also needed for planned meals · {amount(row.meal.buy)} {row.unit} to buy for meals.
          </p>
        )}
        <label style={{ ...wrap, marginTop: 10 }}>
          {row.meal ? 'Extra to buy' : 'Quantity to buy'} ({row.unit})
          <input
            aria-label={`${row.meal ? 'Extra to buy' : 'Quantity to buy'}: ${row.group.name}`}
            type="number"
            min="0"
            step="any"
            placeholder="Set amount"
            value={state.extras[row.id] ?? ''}
            style={{ ...input, width: 120 }}
            disabled={loading || !!error}
            onChange={(event) => {
              const extras = { ...state.extras };
              if (!event.target.value) delete extras[row.id];
              else {
                const value = Number(event.target.value);
                if (!Number.isFinite(value) || value < 0) return;
                extras[row.id] = value;
              }
              save({ ...state, extras });
            }}
          />
        </label>
        {total(row.id, row.meal) > 0 && (
          <p>
            <strong>
              Total to buy: {amount(total(row.id, row.meal))} {row.unit}
            </strong>
          </p>
        )}
        {review(row.id, row.meal)}
        {purchase(row.id, row.group.name, row.unit, row.group.category, row.meal)}
      </article>
    );
  }
  const matches = (name: string) => normalize(name).includes(normalize(search));
  const ingredients =
    result?.ingredients.filter(
      (r) =>
        (showStock || r.buy > 1e-9 || r.unknown || (state.extras[r.id] ?? 0) > 0) &&
        matches(r.name),
    ) ?? [];
  const lows = result?.lowStock.filter((r) => matches(r.group.name)) ?? [];
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 0', color: '#3e3541' }}>
      <div style={{ ...wrap, justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: '0 0 6px' }}>Shopping List</h2>
          <p style={{ ...muted, margin: 0 }}>A little planning, a well-stocked kitchen.</p>
        </div>
        <button style={button} disabled={loading} onClick={() => setRefresh((n) => n + 1)}>
          Refresh
        </button>
      </div>
      <section aria-label="Shopping filters" style={{ ...panel, background: '#faf5f3' }}>
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
          <button style={button} onClick={() => period(currentWeek, 1)}>
            This week
          </button>
          <button style={button} onClick={() => period(addDays(currentWeek, 7), 1)}>
            Next week only
          </button>
          <button style={button} aria-pressed={weeks === 2} onClick={() => period(currentWeek, 2)}>
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
                    style={{ ...button, background: days.includes(day) ? '#e0ebdf' : '#fff' }}
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
                    background: recipes.includes(recipe.recipeId) ? '#e7dcf0' : '#fff',
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
        <p role="alert" key={warning}>
          {warning}
        </p>
      ))}
      {result && (
        <>
          <section aria-label="Ingredients for planned meals" style={panel}>
            <h3 style={{ marginTop: 0 }}>Ingredients for planned meals</h3>
            <p style={muted}>
              {selected.length} planned meals · quantities adjusted to your servings.
            </p>
            {!ingredients.length && (
              <p>
                {search
                  ? 'No ingredients match your search.'
                  : !selected.length
                    ? 'No meals planned for these filters.'
                    : result.warnings.length
                      ? 'Some planned recipes could not be calculated. Review the warning above.'
                      : 'Everything needed is in stock.'}
              </p>
            )}
            {ingredients.filter((r) => !checked(r.id, r)).map(ingredient)}
            {ingredients.some((r) => checked(r.id, r)) && (
              <details>
                <summary style={{ ...button, marginTop: 12 }}>
                  In basket ({ingredients.filter((r) => checked(r.id, r)).length})
                </summary>
                {ingredients.filter((r) => checked(r.id, r)).map(ingredient)}
              </details>
            )}
          </section>
          <section aria-label="Low-stock inventory" style={{ ...panel, background: '#f5f8f2' }}>
            <h3 style={{ marginTop: 0 }}>Low-stock inventory</h3>
            <p style={muted}>
              Across all storage locations · independent of meal filters. Enter a restock amount
              when you need one.
            </p>
            {!lows.length && (
              <p>{search ? 'No low-stock products match your search.' : 'No low-stock items.'}</p>
            )}
            {lows.filter((r) => !checked(r.id, r.meal)).map(lowStock)}
            {lows.some((r) => checked(r.id, r.meal)) && (
              <details>
                <summary style={{ ...button, marginTop: 12 }}>
                  In basket ({lows.filter((r) => checked(r.id, r.meal)).length})
                </summary>
                {lows.filter((r) => checked(r.id, r.meal)).map(lowStock)}
              </details>
            )}
          </section>
          <p style={muted}>
            Basket checkmarks and restock amounts are saved for this period on this device. Checking
            a product does not change inventory.
          </p>
        </>
      )}
    </div>
  );
}
