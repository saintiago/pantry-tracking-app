import {
  batchBalance,
  positivePortions,
  validDate,
  validKcal,
  type PlannerSnapshot,
  type PlannerEntry,
} from '@pantry/domain';

const types = ['recipe', 'leftovers', 'eating-out', 'custom', 'leftovers-note'];
const validId = (value: unknown) => typeof value === 'string' && /^[\w-]{1,100}$/.test(value);
export function validateEntry(entry: PlannerEntry): string | null {
  if (
    !validId(entry.planId) ||
    !validDate(entry.date) ||
    !['breakfast', 'lunch', 'dinner'].includes(entry.mealType)
  )
    return 'Invalid entry identity, date or meal';
  if (!types.includes(entry.entryType ?? 'recipe')) return 'Invalid entry type';
  if (
    typeof entry.recipeName !== 'string' ||
    !entry.recipeName.trim() ||
    entry.recipeName.length > 1000
  )
    return 'A title is required';
  if (entry.notes !== undefined && (typeof entry.notes !== 'string' || entry.notes.length > 10000))
    return 'Invalid notes';
  if (entry.servings !== undefined && !positivePortions(entry.servings))
    return 'Portions must be positive';
  if (!validKcal(entry.kcalPerPortion)) return 'Calories must be finite and non-negative';
  if ((!entry.entryType || entry.entryType === 'recipe') && !validId(entry.recipeId))
    return 'A recipe is required';
  if (entry.entryType === 'leftovers' && !validId(entry.batchId)) return 'Select a source batch';
  if (entry.batchId && !['recipe', 'leftovers'].includes(entry.entryType ?? 'recipe'))
    return 'Only recipes and linked leftovers can reserve batches';
  if (entry.consumed !== undefined && typeof entry.consumed !== 'boolean')
    return 'Invalid consumption status';
  return null;
}
export function validatePlanner(state: PlannerSnapshot): string | null {
  if (
    new Set(state.mealPlans.map((e) => e.planId)).size !== state.mealPlans.length ||
    new Set(state.batches.map((b) => b.batchId)).size !== state.batches.length
  )
    return 'Duplicate identifiers';
  for (const entry of state.mealPlans) {
    const error = validateEntry(entry);
    if (error) return error;
    if (!entry.batchId) {
      if (entry.consumed) return 'Only prepared batch portions can be marked eaten';
      continue;
    }
    const batch = state.batches.find((b) => b.batchId === entry.batchId);
    if (!batch || batch.recipeId !== entry.recipeId) return 'Invalid source batch';
    if (entry.date < (batch.preparedDate ?? batch.cookingDate))
      return 'Leftovers cannot precede cooking';
    if (entry.consumed && batch.status !== 'prepared')
      return 'Confirm the batch as cooked before marking portions eaten';
    if ((entry.entryType ?? 'recipe') === 'recipe' && batch.sourcePlanId !== entry.planId)
      return 'A batch has only one cooking assignment';
  }
  for (const batch of state.batches) {
    if (
      !validId(batch.batchId) ||
      !validId(batch.recipeId) ||
      !validId(batch.sourcePlanId) ||
      !validDate(batch.cookingDate)
    )
      return 'Invalid batch';
    if (!positivePortions(batch.plannedYield) || !['planned', 'prepared'].includes(batch.status))
      return 'Invalid batch yield or status';
    if (
      ![batch.consumed, batch.discarded].every(
        (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0,
      ) ||
      !validKcal(batch.kcalPerPortion)
    )
      return 'Invalid batch quantities';
    const source = state.mealPlans.find((e) => e.planId === batch.sourcePlanId);
    if (
      batch.status === 'planned' &&
      (!source ||
        source.batchId !== batch.batchId ||
        source.date !== batch.cookingDate ||
        (source.entryType ?? 'recipe') !== 'recipe')
    )
      return 'Resolve dependent leftovers before removing or moving their cooking assignment';
    if (batch.status === 'planned' && (batch.consumed || batch.discarded))
      return 'Planned food cannot be consumed or discarded';
    if (
      batch.status === 'prepared' &&
      (!positivePortions(batch.actualYield) ||
        !validDate(batch.preparedDate) ||
        typeof batch.storage !== 'string' ||
        !batch.storage.trim())
    )
      return 'Actual yield, preparation date and storage are required';
    if (
      batch.useBy !== undefined &&
      (!validDate(batch.useBy) || batch.useBy < (batch.preparedDate ?? batch.cookingDate))
    )
      return 'Invalid use-by date';
    if (batchBalance(batch, state.mealPlans).available < -0.00000001)
      return 'Batch over-allocated: reduce or remove reservations before reducing yield or discarding portions';
  }
  if (new Set(state.favorites.map((f) => f.favoriteId)).size !== state.favorites.length)
    return 'Duplicate favorite identifiers';
  for (const favorite of state.favorites) {
    if (
      !validId(favorite.favoriteId) ||
      (favorite.kind !== undefined && !['day', 'week'].includes(favorite.kind)) ||
      typeof favorite.name !== 'string' ||
      !favorite.name.trim() ||
      favorite.name.length > 200 ||
      !Array.isArray(favorite.entries) ||
      !Array.isArray(favorite.batches)
    )
      return 'Invalid favorite week';
    if (favorite.entries.length > 90) return 'A favorite week supports at most 90 entries';
    for (const entry of favorite.entries) {
      if (
        !Number.isInteger(entry.dayOffset) ||
        entry.dayOffset < 0 ||
        entry.dayOffset > 6 ||
        (favorite.kind === 'day' && entry.dayOffset !== 0) ||
        entry.consumed
      )
        return 'Invalid favorite weekday or consumption status';
      const error = validateEntry({ ...entry, date: '2000-01-03' });
      if (error) return error;
      if (
        entry.batchId &&
        !favorite.batches.some(
          (b) =>
            b.batchId === entry.batchId &&
            favorite.entries.some((e) => e.planId === b.sourcePlanId),
        )
      )
        return 'Favorite leftovers must include their cooking source';
    }
    if (favorite.batches.some((b) => b.status !== 'planned' || b.consumed || b.discarded))
      return 'Favorite weeks must contain planned batches only';
    const entries = favorite.entries.map((e) => ({
      ...e,
      date: `2000-01-${String(3 + e.dayOffset).padStart(2, '0')}`,
    }));
    const error = validatePlanner({
      contractVersion: 2,
      revision: 0,
      favorites: [],
      mealPlans: entries,
      batches: favorite.batches.map((b) => ({
        ...b,
        cookingDate: entries.find((e) => e.planId === b.sourcePlanId)?.date ?? '',
      })),
    });
    if (error) return error;
  }
  return null;
}
