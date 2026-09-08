import { expect, type Locator, type Page } from '@playwright/test';
import type { PlannerChange, PlannerEntry, PlannerSnapshot } from '@pantry/domain';
import { validatePlanner } from '../../backend/src/handlers/meal-plan/planner-rules';
export const monday = '2026-09-07';
export const recipe = {
  recipeId: 'pasta',
  name: 'Pasta',
  tags: ['dinner', 'vegetarian'],
  portions: 4,
  totalKcal: 1600,
  ingredients: [{ name: 'Pasta', quantity: 400, unit: 'g' }],
  instructions: ['Boil water', 'Cook pasta', 'Serve'],
};
export const meal = (planId = 'planned', date = '2026-09-15'): PlannerEntry => ({
  planId,
  date,
  mealType: 'lunch',
  recipeId: 'pasta',
  recipeName: 'Pasta',
  servings: 2,
  createdAt: monday,
  updatedAt: monday,
});
export async function setupPlanner(page: Page, initial: PlannerEntry[] = [meal()], count = 2) {
  await page.clock.setFixedTime(new Date('2026-09-07T12:00:00Z'));
  let state: PlannerSnapshot = {
    contractVersion: 2,
    revision: 0,
    mealPlans: initial,
    batches: [],
    favorites: [],
  };
  const recipes = [
    recipe,
    {
      ...recipe,
      recipeId: 'apple',
      name: 'Apple bowl',
      tags: ['breakfast'],
      totalKcal: undefined,
      portions: 1,
      ingredients: [{ name: 'Apple', quantity: 1, unit: 'piece' }],
    },
    ...Array.from({ length: Math.max(0, count - 2) }, (_, i) => ({
      ...recipe,
      recipeId: `recipe-${i}`,
      name: `Recipe ${String(i).padStart(2, '0')}`,
    })),
  ];
  const writes: PlannerChange[] = [];
  const receipts = new Set<string>();
  const options = {
    fail: false,
    loseResponse: false,
    detailFail: false,
    recipeFail: false,
    inventoryFail: false,
  };
  await page.route('https://mock-api.test/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
    if (url.pathname === '/recipes') {
      if (options.recipeFail) return json({ message: 'Recipe load failed' }, 500);
      if (req.method() === 'POST') {
        const next = { ...req.postDataJSON(), recipeId: `new-${recipes.length}` };
        recipes.push(next);
        return json({ recipe: next }, 201);
      }
      return json({ recipes });
    }
    if (url.pathname === '/recipes/tags')
      return json({ tags: ['dinner', 'vegetarian', 'breakfast'] });
    if (url.pathname.startsWith('/recipes/')) {
      if (options.detailFail) return json({ message: 'Recipe unavailable' }, 500);
      const index = recipes.findIndex((r) => url.pathname.endsWith(r.recipeId));
      if (req.method() === 'PUT') {
        recipes[index] = { ...recipes[index], ...req.postDataJSON() };
        return json({ recipe: recipes[index] });
      }
      return json({
        recipe: recipes[index],
        ingredientAvailability: [
          { name: 'Pasta', unit: 'g', required: 400, available: 0, status: 'missing' },
        ],
        missingCount: 1,
      });
    }
    if (url.pathname === '/meal-plans') {
      if (req.method() === 'GET')
        return json(
          url.searchParams.get('view') === 'workspace'
            ? state
            : {
                mealPlans: state.mealPlans.filter(
                  (p) =>
                    p.date >= url.searchParams.get('startDate')! &&
                    p.date <= url.searchParams.get('endDate')!,
                ),
                batches: state.batches,
              },
        );
      const body = req.postDataJSON();
      const change = body.change as PlannerChange;
      writes.push(change);
      if (options.fail) return json({ message: 'Save failed' }, 500);
      if (body.action === 'reconcile') {
        receipts.add(change.operationId);
        return json(state);
      }
      if (receipts.has(change.operationId)) return json(state);
      if (state.revision !== change.revision) return json({ message: 'The planner changed' }, 409);
      const merge = <T>(
        old: T[],
        updates: T[] = [],
        remove: string[] = [],
        id: (value: T) => string,
      ) => [
        ...old.filter((v) => !remove.includes(id(v)) && !updates.some((u) => id(u) === id(v))),
        ...updates,
      ];
      const next: PlannerSnapshot = {
        ...state,
        revision: state.revision + 1,
        mealPlans: merge(state.mealPlans, change.entries, change.removeIds, (e) => e.planId),
        batches: merge(state.batches, change.batches, change.removeBatchIds, (b) => b.batchId),
        favorites: merge(
          state.favorites,
          change.favorites,
          change.removeFavoriteIds,
          (f) => f.favoriteId,
        ),
      };
      for (const entry of change.entries ?? []) {
        if (entry.consumed && !state.mealPlans.find((e) => e.planId === entry.planId)?.consumed) {
          const batch = next.batches.find((b) => b.batchId === entry.batchId);
          if (batch) batch.consumed += entry.servings ?? 1;
        }
      }
      const error = validatePlanner(next);
      if (error) return json({ message: error }, 400);
      state = next;
      receipts.add(change.operationId);
      if (options.loseResponse) {
        options.loseResponse = false;
        return route.abort();
      }
      return json(state);
    }
    if (url.pathname === '/inventory' && options.inventoryFail)
      return json({ message: 'Stock load failed' }, 500);
    return json({ items: [], groups: [], locations: [{ locationId: 'pantry', name: 'Pantry' }] });
  });
  await page.goto('/');
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: 'Meal Plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next week', exact: true })).toBeEnabled();
  return { writes, recipes, options, state: () => state };
}
export async function pointerDrag(page: Page, from: Locator, to: Locator) {
  await expect(page.locator('[data-recipe-library]')).not.toHaveAttribute(
    'data-drop-disabled',
    'true',
  );
  // Center cards away from the sticky header and fixed bottom navigation.
  await from.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const a = await from.boundingBox();
  if (!a) throw new Error('Drag source unavailable');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2);
  await to.scrollIntoViewIfNeeded();
  const b = await to.boundingBox();
  if (!b) throw new Error('Drag target unavailable');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  const destination = await to.boundingBox();
  if (!destination) throw new Error('Drop target disappeared');
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + destination.height / 2,
  );
  await page.mouse.up();
}
export const slot = (page: Page, date = monday, meal = 'lunch') =>
  page.locator(`[data-meal-date="${date}"][data-meal-type="${meal}"]`);
