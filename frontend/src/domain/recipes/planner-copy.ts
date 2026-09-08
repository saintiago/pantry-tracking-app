import type { CookingBatch, FavoriteWeek, PlannerEntry, PlannerSnapshot } from '@pantry/domain';
const shift = (date: string, days: number) =>
  new Date(new Date(date + 'T00:00:00Z').getTime() + days * 86400000).toISOString().slice(0, 10);
export function favoriteFromRange(
  state: PlannerSnapshot,
  start: string,
  end: string,
  name: string,
  favoriteId: string,
): FavoriteWeek {
  const entries = state.mealPlans.filter((e) => e.date >= start && e.date <= end);
  const batches = state.batches.filter((b) => entries.some((e) => e.planId === b.sourcePlanId));
  return {
    favoriteId,
    name,
    kind: start === end ? 'day' : 'week',
    entries: entries.map((e) => {
      const { date, consumed: _consumed, ...rest } = e;
      void _consumed;
      return {
        ...rest,
        dayOffset: Math.round((new Date(date).getTime() - new Date(start).getTime()) / 86400000),
      };
    }),
    batches: batches.map((b) => ({
      batchId: b.batchId,
      sourcePlanId: b.sourcePlanId,
      recipeId: b.recipeId,
      recipeName: b.recipeName,
      cookingDate: b.cookingDate,
      plannedYield: b.plannedYield,
      status: 'planned',
      consumed: 0,
      discarded: 0,
    })),
  };
}
export function previewCopy(
  template: FavoriteWeek,
  destination: string,
  recipes: { recipeId: string }[],
  id: () => string,
) {
  const ids = new Map(template.entries.map((e) => [e.planId, id()]));
  const batchIds = new Map(template.batches.map((b) => [b.batchId, id()]));
  const warnings: string[] = [];
  const entries: PlannerEntry[] = template.entries.map((e) => {
    const { dayOffset, ...entry } = e;
    if (
      (!e.entryType || ['recipe', 'leftovers'].includes(e.entryType)) &&
      !recipes.some((r) => r.recipeId === e.recipeId)
    )
      warnings.push(`Recipe unavailable: ${e.recipeName}`);
    if (
      e.batchId &&
      (!batchIds.has(e.batchId) ||
        !template.batches.some((b) => b.batchId === e.batchId && ids.has(b.sourcePlanId)))
    )
      warnings.push(`Leftovers need their cooking source: ${e.recipeName}`);
    return {
      ...entry,
      date: shift(destination, dayOffset),
      planId: ids.get(e.planId)!,
      batchId: e.batchId ? batchIds.get(e.batchId) : undefined,
      consumed: false,
      createdAt: '',
      updatedAt: '',
    };
  });
  const batches: CookingBatch[] = template.batches.map((b) => ({
    ...b,
    batchId: batchIds.get(b.batchId)!,
    sourcePlanId: ids.get(b.sourcePlanId)!,
    cookingDate: entries.find((e) => e.planId === ids.get(b.sourcePlanId))?.date ?? destination,
    status: 'planned',
    consumed: 0,
    discarded: 0,
  }));
  return { entries, batches, warnings };
}
