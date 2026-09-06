import type { InventoryItem, InventoryGroup } from '../../api/inventory/inventory';
import type { Recipe } from '../../api/recipes/recipes';
import type { MealPlan } from '../../api/meal-plans/meal-plans';
import { LEGACY_UNIT_MAP } from '../../types/units';

export const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');
export function baseUnit(unit: string): { unit: string; factor: number } {
  const key = LEGACY_UNIT_MAP[unit] ?? unit;
  if (key === 'kg') return { unit: 'g', factor: 1000 };
  if (key === 'l') return { unit: 'ml', factor: 1000 };
  return { unit: key, factor: 1 };
}
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function amount(value: number): string {
  if (value > 0 && value < 0.001) return '<0.001';
  return String(Math.round(value * 1000) / 1000);
}
export interface Contribution {
  planId: string;
  recipeId: string;
  recipeName: string;
  date: string;
  mealType: string;
  quantity: number | null;
}
export interface ShoppingRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  needed: number;
  available: number;
  buy: number;
  unknown: boolean;
  warnings: string[];
  contributions: Contribution[];
}
export interface LowStockRow {
  id: string;
  group: InventoryGroup;
  unit: string;
  stock: number;
  meal?: ShoppingRow;
}
export interface ShoppingData {
  items: InventoryItem[];
  groups: InventoryGroup[];
  recipes: Recipe[];
  plans: MealPlan[];
}

export function calculateShopping(data: ShoppingData, plans: MealPlan[], today: string) {
  const rows = new Map<string, ShoppingRow>();
  const warnings = new Set<string>();
  const remaining = new Map(
    data.items.map((item) => [item.itemId, item.quantity * baseUnit(item.unit).factor]),
  );
  const order: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };
  const sorted = [...plans].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      order[a.mealType] - order[b.mealType] ||
      a.planId.localeCompare(b.planId),
  );
  for (const plan of sorted) {
    const recipe = data.recipes.find((r) => r.recipeId === plan.recipeId);
    if (!recipe) {
      warnings.add(
        `Recipe unavailable: ${plan.recipeName} (${plan.date}). Its ingredients could not be calculated.`,
      );
      continue;
    }
    for (const ingredient of recipe.ingredients) {
      const { unit, factor } = baseUnit(ingredient.unit);
      const linked = ingredient.inventoryItemId
        ? data.items.find((i) => i.itemId === ingredient.inventoryItemId)
        : undefined;
      const candidates = data.groups.filter(
        (g) => normalize(g.name) === normalize(ingredient.name) && baseUnit(g.unit).unit === unit,
      );
      const group = linked
        ? data.groups.find((g) => g.groupId === linked.groupId && baseUnit(g.unit).unit === unit)
        : candidates.length === 1
          ? candidates[0]
          : undefined;
      const uncertain =
        Boolean(ingredient.inventoryItemId && !group) || (candidates.length > 1 && !linked);
      const sameName = data.items.filter((i) => normalize(i.name) === normalize(ingredient.name));
      const incompatible = !group && sameName.some((i) => baseUnit(i.unit).unit !== unit);
      const lots =
        uncertain || incompatible
          ? []
          : data.items.filter(
              (i) =>
                baseUnit(i.unit).unit === unit &&
                (group
                  ? i.groupId === group.groupId
                  : normalize(i.name) === normalize(ingredient.name)),
            );
      const id = group
        ? `group:${group.groupId}`
        : `ingredient:${normalize(ingredient.name)}:${unit}:${ingredient.inventoryItemId ?? ''}`;
      let row = rows.get(id);
      if (!row) {
        row = {
          id,
          name: group?.name ?? ingredient.name,
          category: group?.category ?? 'Food',
          unit,
          needed: 0,
          available: 0,
          buy: 0,
          unknown: false,
          warnings: [],
          contributions: [],
        };
        rows.set(id, row);
      }
      const warn = (message: string) => {
        if (!row!.warnings.includes(message)) row!.warnings.push(message);
      };
      if (uncertain || incompatible) warn('Check inventory match');
      if (lots.some((lot) => lot.quantity > 0 && lot.expirationDate && lot.expirationDate < today))
        warn('Expired stock excluded');
      if (
        lots.some(
          (lot) =>
            lot.quantity > 0 && lot.expirationDate >= today && lot.expirationDate < plan.date,
        )
      )
        warn('Stock expires before a planned meal');
      const quantity =
        ingredient.quantity === null
          ? null
          : (ingredient.quantity * factor * (plan.servings ?? recipe.portions ?? 1)) /
            (recipe.portions ?? 1);
      row.contributions.push({
        planId: plan.planId,
        recipeId: recipe.recipeId,
        recipeName: recipe.name,
        date: plan.date,
        mealType: plan.mealType,
        quantity,
      });
      if (quantity === null) {
        row.unknown = true;
        continue;
      }
      row.needed += quantity;
      let missing = quantity;
      for (const lot of [...lots].sort((a, b) =>
        a.expirationDate.localeCompare(b.expirationDate),
      )) {
        if (!lot.expirationDate || lot.expirationDate < today || lot.expirationDate < plan.date)
          continue;
        const used = Math.min(missing, remaining.get(lot.itemId) ?? 0);
        remaining.set(lot.itemId, (remaining.get(lot.itemId) ?? 0) - used);
        missing -= used;
        if (missing <= 0) break;
      }
      row.available += quantity - missing;
      row.buy += Math.max(0, missing);
    }
  }
  const ingredients = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  const lowStock: LowStockRow[] = data.groups
    .filter((g) => g.isLowStock && g.threshold !== undefined)
    .map((group) => ({
      id: `group:${group.groupId}`,
      group,
      unit: baseUnit(group.unit).unit,
      stock: group.totalQuantity * baseUnit(group.unit).factor,
      meal: rows.get(`group:${group.groupId}`),
    }))
    .sort((a, b) => a.group.name.localeCompare(b.group.name));
  return { ingredients, lowStock, warnings: [...warnings] };
}

export interface BasketEntry {
  quantity: number;
  plans: string[];
  unknown: boolean;
}
export interface ShoppingState {
  checked: Record<string, BasketEntry>;
  extras: Record<string, number>;
}
export const emptyState = (): ShoppingState => ({ checked: {}, extras: {} });
export const storageKey = (userId: string, start: string, end: string): string =>
  `pantry-shopping-v1:${userId}:${start}:${end}`;
export function readState(key: string): ShoppingState {
  const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
  if (!parsed) return emptyState();
  if (
    !parsed.checked ||
    !parsed.extras ||
    typeof parsed.checked !== 'object' ||
    typeof parsed.extras !== 'object'
  )
    throw new Error('Invalid saved shopping state');
  for (const entry of Object.values(parsed.checked) as BasketEntry[]) {
    if (
      !entry ||
      !Number.isFinite(entry.quantity) ||
      entry.quantity < 0 ||
      !Array.isArray(entry.plans) ||
      !entry.plans.every((id) => typeof id === 'string') ||
      typeof entry.unknown !== 'boolean'
    )
      throw new Error('Invalid saved basket');
  }
  if (
    Object.values(parsed.extras).some(
      (value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0,
    )
  )
    throw new Error('Invalid saved quantities');
  return parsed;
}
export function needsReview(
  entry: BasketEntry | undefined,
  quantity: number,
  row?: ShoppingRow,
): boolean {
  return (
    !!entry &&
    (quantity > entry.quantity + 1e-9 ||
      (!!row?.unknown && !entry.unknown) ||
      !!row?.contributions.some((c) => !entry.plans.includes(c.planId)))
  );
}
