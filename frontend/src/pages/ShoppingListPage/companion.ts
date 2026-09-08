import type { AddItemData } from '../AddItemPage/AddItemPage';
import { baseUnit, calculateShopping, normalize } from './shopping';
import type { ShoppingData, ShoppingRow } from './shopping';
import { departmentFor, type Department } from './departments';

export interface ManualItem {
  createdAt?: string;
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  store: string;
  notes: string;
}
export interface ProductPreference {
  store?: string;
  alternativeStore?: string;
  brand?: string;
  barcode?: string;
  link?: string;
  department?: Department;
  locationId?: string;
  packageSize?: number;
  packageUnit?: string;
  packagePrice?: number;
  reserve?: number;
  substitute?: boolean;
  replacement?: string;
}
export interface ShoppingLine {
  addedAt?: string;
  icon?: string;
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  meal?: ShoppingRow;
  reserve: number;
  extra: number;
  manualIds: string[];
  sources: string[];
  store: string;
  department: Department;
  unknown: boolean;
  notes?: string;
  carried?: boolean;
  carryPeriod?: string;
}
export interface CompanionState {
  mappings?: Record<
    string,
    { name: string; groupId?: string; unit: string; purchasedUnit: string; ratio: number }
  >;
  manual: ManualItem[];
  preferences: Record<string, ProductPreference>;
  deferred: Record<
    string,
    { kind: 'later' | 'skip' | 'unavailable'; until?: string; period?: string }
  >;
  carry: Record<string, ShoppingLine>;
  history: { id: string; name: string; date: string; quantity: number; unit: string }[];
  budget?: number;
  deliveryBudget?: number;
}
export const companionKey = (userId: string) => `pantry-companion-v1:${userId}`;
export const emptyCompanion = (): CompanionState => ({
  manual: [],
  preferences: {},
  deferred: {},
  carry: {},
  history: [],
});
const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export function readCompanion(key: string): CompanionState {
  const raw = localStorage.getItem(key);
  if (!raw) return emptyCompanion();
  const value = JSON.parse(raw) as CompanionState;
  if (
    !Array.isArray(value.manual) ||
    !Array.isArray(value.history) ||
    !value.preferences ||
    !value.deferred ||
    !value.carry
  )
    throw new Error('Invalid shopping companion data');
  if (
    value.manual.some(
      (i) =>
        !i ||
        typeof i.id !== 'string' ||
        typeof i.name !== 'string' ||
        !finite(i.quantity) ||
        typeof i.unit !== 'string' ||
        typeof i.category !== 'string' ||
        typeof i.store !== 'string' ||
        typeof i.notes !== 'string',
    )
  )
    throw new Error('Invalid manual items');
  for (const p of Object.values(value.preferences)) {
    if (
      !p ||
      ['packageSize', 'packagePrice', 'reserve'].some(
        (k) =>
          p[k as keyof ProductPreference] !== undefined && !finite(p[k as keyof ProductPreference]),
      )
    )
      throw new Error('Invalid product preferences');
  }
  if (
    Object.values(value.carry).some(
      (r) =>
        !r ||
        typeof r.id !== 'string' ||
        typeof r.name !== 'string' ||
        !finite(r.quantity) ||
        !Array.isArray(r.sources),
    )
  )
    throw new Error('Invalid pending items');
  if (
    value.history.some(
      (h) => !h || typeof h.id !== 'string' || typeof h.date !== 'string' || !finite(h.quantity),
    )
  )
    throw new Error('Invalid purchase history');
  for (const mapping of Object.values(value.mappings ?? {})) {
    if (
      !mapping ||
      typeof mapping.name !== 'string' ||
      typeof mapping.unit !== 'string' ||
      typeof mapping.purchasedUnit !== 'string' ||
      !finite(mapping.ratio)
    )
      throw new Error('Invalid purchase conversions');
  }
  for (const action of Object.values(value.deferred)) {
    if (!action || !['later', 'skip', 'unavailable'].includes(action.kind))
      throw new Error('Invalid deferred items');
  }
  if ([value.budget, value.deliveryBudget].some((n) => n !== undefined && !finite(n)))
    throw new Error('Invalid budget');
  return value;
}
export function safeProductLink(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function packageSuggestion(quantity: number, unit: string, preference: ProductPreference) {
  const pack = baseUnit(preference.packageUnit ?? unit);
  if (!preference.packageSize || pack.unit !== baseUnit(unit).unit) return undefined;
  const size = (preference.packageSize * pack.factor) / baseUnit(unit).factor;
  const count = Math.ceil(Math.max(0, quantity / size - 1e-10));
  return {
    count,
    size,
    quantity: count * size,
    remainder: Math.max(0, count * size - quantity),
    price: preference.packagePrice === undefined ? undefined : count * preference.packagePrice,
  };
}
/** Reserve stock must still be usable at the end of the selected meal horizon. */
export function buildLines(
  data: ShoppingData,
  result: ReturnType<typeof calculateShopping>,
  state: CompanionState,
  today: string,
  period = '',
): ShoppingLine[] {
  const lines = new Map<string, ShoppingLine>();
  for (const meal of result.ingredients)
    lines.set(meal.id, {
      id: meal.id,
      name: meal.name,
      category: meal.category,
      unit: meal.unit,
      quantity: meal.buy,
      meal,
      reserve: 0,
      extra: 0,
      manualIds: [],
      sources: ['Planned meals'],
      store: '',
      department: departmentFor(meal.name, meal.category),
      unknown: meal.unknown,
    });
  for (const group of data.groups) {
    const id = `group:${group.groupId}`;
    const preference = state.preferences[id] ?? {};
    const target =
      preference.reserve !== undefined
        ? preference.reserve
        : (group.threshold ?? 0) * baseUnit(group.thresholdUnit ?? group.unit).factor;
    if (group.threshold === undefined && preference.reserve === undefined) continue;
    const meal = lines.get(id)?.meal;
    const horizon =
      meal?.contributions.reduce((date, c) => (c.date > date ? c.date : date), today) ?? today;
    const usable = data.items
      .filter(
        (i) =>
          i.groupId === group.groupId && (i.expirationDate === null || i.expirationDate >= horizon),
      )
      .reduce((sum, i) => sum + (result.remaining.get(i.itemId) ?? 0), 0);
    const remaining = Math.max(0, usable);
    const extra = Math.max(0, target - remaining);
    if (!group.isLowStock && extra === 0) continue;
    const line = lines.get(id) ?? {
      id,
      name: group.name,
      category: group.category,
      unit: baseUnit(group.unit).unit,
      quantity: 0,
      reserve: 0,
      extra: 0,
      manualIds: [],
      sources: [],
      store: '',
      department: departmentFor(group.name, group.category),
      unknown: false,
    };
    line.reserve = target;
    line.extra = extra;
    line.quantity += extra;
    line.sources.push('Restock');
    lines.set(id, line);
  }
  for (const manual of state.manual) {
    const canonical = baseUnit(manual.unit);
    const matches = [...lines.values()].filter(
      (l) => normalize(l.name) === normalize(manual.name) && l.unit === canonical.unit,
    );
    const groups = data.groups.filter(
      (g) =>
        normalize(g.name) === normalize(manual.name) && baseUnit(g.unit).unit === canonical.unit,
    );
    const match = matches.length === 1 && groups.length <= 1 ? matches[0] : undefined;
    const id =
      match?.id ?? (groups.length === 1 ? `group:${groups[0].groupId}` : `manual:${manual.id}`);
    const line = match ??
      lines.get(id) ?? {
        id,
        name: manual.name,
        category: manual.category,
        unit: canonical.unit,
        quantity: 0,
        reserve: 0,
        extra: 0,
        manualIds: [],
        sources: [],
        store: manual.store,
        department: departmentFor(manual.name, manual.category),
        unknown: false,
      };
    line.quantity += manual.quantity * canonical.factor;
    line.manualIds.push(manual.id);
    if (!line.sources.includes('Manual')) line.sources.push('Manual');
    if (!line.store) line.store = manual.store;
    line.notes = manual.notes;
    lines.set(id, line);
  }
  for (const carried of Object.values(state.carry)) {
    if (!lines.has(carried.id) && carried.quantity > 0 && carried.carryPeriod !== period)
      lines.set(carried.id, {
        ...carried,
        carried: true,
        sources: [...new Set([...carried.sources, 'Carried forward'])],
      });
  }
  for (const line of lines.values()) {
    const pref = state.preferences[line.id];
    const lot = data.items.find((i) => `group:${i.groupId}` === line.id);
    // Keep absence distinct from a user-written store literally named "Any store".
    line.store = pref?.store || line.store || lot?.whereToBuy || '';
    line.department = pref?.department ?? line.department;
    line.icon = lot?.icon;
    const dates = [
      line.addedAt ?? '',
      lot?.createdAt ?? '',
      ...line.manualIds.map((id) => state.manual.find((m) => m.id === id)?.createdAt ?? ''),
      ...(line.meal?.contributions.map(
        (c) => data.plans.find((p) => p.planId === c.planId)?.createdAt ?? '',
      ) ?? []),
    ];
    line.addedAt = dates.sort().at(-1) ?? '';
  }
  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function isDeferred(
  state: CompanionState,
  id: string,
  today: string,
  period: string,
): boolean {
  const action = state.deferred[id];
  return (
    !!action &&
    (action.kind === 'unavailable' ||
      (action.kind === 'skip' && action.period === period) ||
      (action.kind === 'later' && !!action.until && action.until > today))
  );
}
export function completePurchase(
  state: CompanionState,
  line: ShoppingLine,
  covered: number,
  actual: AddItemData,
  today: string,
): CompanionState {
  const next: CompanionState = {
    ...state,
    manual: state.manual.map((m) => ({ ...m })),
    carry: { ...state.carry },
    deferred: { ...state.deferred },
    history: [
      ...state.history,
      { id: line.id, name: actual.name, date: today, quantity: actual.quantity, unit: actual.unit },
    ].slice(-500),
  };
  // Allocate purchases to meal/reserve demand first, then manual additions.
  const generatedDemand = line.carried ? line.quantity : (line.meal?.buy ?? 0) + line.extra;
  let remaining = Math.max(0, covered - generatedDemand);
  next.manual = next.manual.filter((manual) => {
    if (!line.manualIds.includes(manual.id)) return true;
    const factor = baseUnit(manual.unit).factor;
    const used = Math.min(manual.quantity * factor, remaining);
    remaining -= used;
    manual.quantity = Math.max(0, manual.quantity - used / factor);
    return manual.quantity > 1e-9;
  });
  delete next.deferred[line.id];
  const generatedRemaining = Math.max(0, generatedDemand - covered);
  if (generatedRemaining < 1e-9) delete next.carry[line.id];
  else
    next.carry[line.id] = {
      ...line,
      quantity: generatedRemaining,
      manualIds: [],
      sources: line.sources.filter((source) => source !== 'Manual'),
      carried: true,
    };
  return next;
}

/** A purchase cadence is a reminder, never an estimate of consumption or stock. */
export function purchaseCadence(history: CompanionState['history']) {
  const products = new Map<string, typeof history>();
  for (const entry of history) products.set(entry.id, [...(products.get(entry.id) ?? []), entry]);
  return [...products.values()].flatMap((entries) => {
    const dates = [...new Set(entries.map((e) => e.date.slice(0, 10)))].sort();
    if (dates.length < 3) return [];
    const interval = Math.max(
      1,
      Math.round(
        (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) /
          86400000 /
          (dates.length - 1),
      ),
    );
    if (!Number.isFinite(interval)) return [];
    return [
      { id: entries[0].id, name: entries[entries.length - 1].name, interval, count: dates.length },
    ];
  });
}

/** Explicit package/substitution conversions follow the real lot's remaining quantity and expiry. */
export function shoppingInventory(data: ShoppingData, state: CompanionState): ShoppingData {
  return {
    ...data,
    items: data.items.map((item) => {
      const mapping = state.mappings?.[item.itemId];
      if (!mapping || baseUnit(item.unit).unit !== baseUnit(mapping.purchasedUnit).unit)
        return item;
      const purchasedQuantity =
        (item.quantity * baseUnit(item.unit).factor) / baseUnit(mapping.purchasedUnit).factor;
      return {
        ...item,
        name: mapping.name,
        groupId: mapping.groupId,
        unit: mapping.unit,
        quantity: purchasedQuantity * mapping.ratio,
      };
    }),
  };
}
