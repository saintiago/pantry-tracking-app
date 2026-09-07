/** Version 2 planner contracts. Legacy assignments omit all extension fields. */
export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type EntryType = 'recipe' | 'leftovers' | 'eating-out' | 'custom' | 'leftovers-note';
export interface PlannerEntry {
  planId: string;
  date: string;
  mealType: MealType;
  recipeId: string;
  recipeName: string;
  servings?: number;
  entryType?: EntryType;
  notes?: string;
  kcalPerPortion?: number;
  batchId?: string;
  consumed?: boolean;
  createdAt: string;
  updatedAt: string;
  syncVersion?: number;
  contractVersion?: 2;
}
export interface CookingBatch {
  batchId: string;
  sourcePlanId: string;
  recipeId: string;
  recipeName: string;
  cookingDate: string;
  plannedYield: number;
  status: 'planned' | 'prepared';
  actualYield?: number;
  preparedDate?: string;
  storage?: string;
  useBy?: string;
  kcalPerPortion?: number;
  discarded: number;
  /** Includes consumption retained after an eaten calendar entry is removed. */
  consumed: number;
  consumedAllocations?: Record<string, number>;
}
export interface FavoriteWeek {
  favoriteId: string;
  name: string;
  entries: (Omit<PlannerEntry, 'date'> & { dayOffset: number })[];
  batches: CookingBatch[];
}
export interface PlannerSnapshot {
  contractVersion: 2;
  revision: number;
  mealPlans: PlannerEntry[];
  batches: CookingBatch[];
  favorites: FavoriteWeek[];
}
export interface PlannerChange {
  operationId: string;
  revision: number;
  entries?: PlannerEntry[];
  removeIds?: string[];
  batches?: CookingBatch[];
  removeBatchIds?: string[];
  favorites?: FavoriteWeek[];
  removeFavoriteIds?: string[];
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function positivePortions(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100000;
}
export function validKcal(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000000)
  );
}
export function batchBalance(batch: CookingBatch, entries: PlannerEntry[]) {
  const reserved = entries
    .filter((e) => e.batchId === batch.batchId && !e.consumed)
    .reduce((sum, e) => sum + (e.servings ?? 1), 0);
  const yieldValue = batch.status === 'prepared' ? batch.actualYield! : batch.plannedYield;
  return {
    reserved,
    available: yieldValue - reserved - batch.consumed - batch.discarded,
    consumed: batch.consumed,
    discarded: batch.discarded,
  };
}
export function entryKcal(
  entry: PlannerEntry,
  batches: CookingBatch[],
  recipes: { recipeId: string; portions?: number; totalKcal?: number }[],
) {
  const batch = batches.find((b) => b.batchId === entry.batchId);
  if (batch?.status === 'prepared') return batch.kcalPerPortion;
  if (entry.entryType && !['recipe', 'leftovers'].includes(entry.entryType))
    return entry.kcalPerPortion;
  const recipe = recipes.find((r) => r.recipeId === (batch?.recipeId ?? entry.recipeId));
  return recipe?.totalKcal == null ? undefined : recipe.totalKcal / (recipe.portions ?? 1);
}
export function dailyCalories(
  entries: PlannerEntry[],
  kcal: (entry: PlannerEntry) => number | undefined,
) {
  return entries.reduce(
    (total, entry) => {
      const value = kcal(entry);
      if (value === undefined) total.missing++;
      else {
        total.perPerson += value;
        total.allPortions += value * (entry.servings ?? 1);
      }
      return total;
    },
    { perPerson: 0, allPortions: 0, missing: 0 },
  );
}
