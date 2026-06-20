import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Meal Planner
 *
 * Tests the meal planner calendar: view the current week, add a recipe to a day,
 * navigate weeks, and remove a recipe.
 *
 * Requires VITE_MOCK_AUTH=true (set in playwright.config.ts webServer env).
 * Backend API calls are mocked via Playwright route interception using a
 * stateful in-memory store so POST/DELETE are reflected by subsequent GETs.
 *
 * Requirements: 1.1, 3.2, 3.3, 4.5, 4.7, 5.2, 5.4
 */

// ─── Date helpers (mirror frontend weekUtils, UTC-based) ─────────────────────

/** Returns the Monday of the UTC week that contains the reference date. */
function getWeekStartIso(reference: Date = new Date()): string {
  const dayOfWeek = reference.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate() - daysSinceMonday,
    ),
  );
  return monday.toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

function getDayNumber(isoDate: string): number {
  return Number(isoDate.split('-')[2]);
}

// ─── Mock data ───────────────────────────────────────────────────────────────

interface MockMealPlan {
  planId: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  recipeId: string;
  recipeName: string;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}

const mockRecipes = [
  { recipeId: 'recipe-1', name: 'Pasta Carbonara' },
  { recipeId: 'recipe-2', name: 'Tomato Soup' },
  { recipeId: 'recipe-3', name: 'Pancakes' },
];

const weekStart = getWeekStartIso();
const weekEnd = addDaysIso(weekStart, 6);

/** Builds the seed plans for a fresh test: two on Monday (breakfast then lunch). */
function seedPlans(): MockMealPlan[] {
  return [
    {
      planId: 'plan-breakfast',
      date: weekStart, // Monday
      mealType: 'breakfast',
      recipeId: 'recipe-1',
      recipeName: 'Pasta Carbonara',
      createdAt: '2024-01-01T08:00:00Z',
      updatedAt: '2024-01-01T08:00:00Z',
      syncVersion: 1,
    },
    {
      planId: 'plan-lunch',
      date: weekStart, // Monday
      mealType: 'lunch',
      recipeId: 'recipe-2',
      recipeName: 'Tomato Soup',
      createdAt: '2024-01-01T12:00:00Z',
      updatedAt: '2024-01-01T12:00:00Z',
      syncVersion: 1,
    },
  ];
}

// ─── API mock setup ───────────────────────────────────────────────────────────

/** Tracks DELETE calls so a test can assert the planId used. */
const deletedPlanIds: string[] = [];

async function setupMockAPI(page: Page) {
  // Stateful in-memory store, fresh per test (setupMockAPI runs in beforeEach).
  const store: MockMealPlan[] = seedPlans();
  let createdCounter = 0;
  deletedPlanIds.length = 0;

  await page.route('**/auth/verify', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true, userId: 'test-user' }),
    }),
  );

  await page.route('**/locations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ locations: [] }),
    }),
  );

  await page.route('**/inventory', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
    }
    return route.fallback();
  });

  // GET /recipes — used by AddRecipeDialog. Registered before /meal-plans so the
  // more specific glob below takes LIFO precedence where they could overlap.
  await page.route('**/recipes', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recipes: mockRecipes }),
      });
    }
    return route.fallback();
  });

  // DELETE /meal-plans/{planId}
  // NOTE: anchored to the mock API origin (not a bare **/meal-plans glob).
  // A glob like `**/meal-plans**` also matches the Vite module request
  // http://localhost:5173/src/api/meal-plans/meal-plans.ts, which would make
  // the mock return JSON instead of the JS module and crash the app at load.
  await page.route('https://mock-api.test/meal-plans/*', (route) => {
    if (route.request().method() === 'DELETE') {
      const url = route.request().url();
      const planId = url.split('/meal-plans/')[1].split('?')[0];
      deletedPlanIds.push(planId);
      const idx = store.findIndex((p) => p.planId === planId);
      if (idx >= 0) store.splice(idx, 1);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fallback();
  });

  // GET (range-filtered) and POST /meal-plans — anchored to the mock API origin
  // so the trailing wildcard can't match the Vite source module URL.
  await page.route('https://mock-api.test/meal-plans**', (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      const url = new URL(route.request().url());
      const startDate = url.searchParams.get('startDate') ?? '';
      const endDate = url.searchParams.get('endDate') ?? '';
      const mealPlans = store.filter((p) => p.date >= startDate && p.date <= endDate);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mealPlans }),
      });
    }

    if (method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      createdCounter += 1;
      const now = new Date().toISOString();
      const created: MockMealPlan = {
        planId: `plan-new-${createdCounter}`,
        date: body.date,
        mealType: body.mealType,
        recipeId: body.recipeId,
        recipeName: body.recipeName,
        createdAt: now,
        updatedAt: now,
        syncVersion: 1,
      };
      store.push(created);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ mealPlan: created }),
      });
    }

    return route.fallback();
  });
}

async function loginAndGoToMealPlan(page: Page) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  // Wait for inventory page to load, then navigate to Meal Plan
  await page.waitForSelector('h2:has-text("Inventory")', { timeout: 15000 });
  await page.getByRole('button', { name: 'Meal Plan' }).click();
  await page.waitForSelector('h1:has-text("Meal Planner")', { timeout: 10000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Meal Planner', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
    await loginAndGoToMealPlan(page);
  });

  // ── 1. View current week ─────────────────────────────────────────────────

  test('shows 7 day columns with Mon–Sun labels and an Add button each (Req 1.1)', async ({
    page,
  }) => {
    const expectedDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const label of expectedDayLabels) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    const addButtons = page.getByRole('button', { name: 'Add recipe' });
    await expect(addButtons).toHaveCount(7);
  });

  test('day columns show numeric dates matching the current week (Req 1.1)', async ({ page }) => {
    await expect(page.getByText(String(getDayNumber(weekStart))).first()).toBeVisible();
    await expect(page.getByText(String(getDayNumber(weekEnd))).first()).toBeVisible();
  });

  test('renders seeded meal plan cards for the current week (Req 1.1)', async ({ page }) => {
    await expect(page.getByText('Pasta Carbonara')).toBeVisible();
    await expect(page.getByText('Tomato Soup')).toBeVisible();
  });

  test('breakfast card appears before lunch card on the same day (Req 1.1 ordering)', async ({
    page,
  }) => {
    const removeButtons = page.getByRole('button', { name: 'Remove assignment' });
    await expect(removeButtons).toHaveCount(2);

    // The first card in the DOM (breakfast) should be Pasta Carbonara
    const firstCardText = await removeButtons.first().locator('..').textContent();
    expect(firstCardText).toContain('Breakfast');
    expect(firstCardText).toContain('Pasta Carbonara');
  });

  // ── 2. Add a recipe to a day ─────────────────────────────────────────────

  test('can add a recipe to a day and the card appears (Req 4.5, 4.7)', async ({ page }) => {
    // Open the Add dialog on Tuesday (second column)
    const addButtons = page.getByRole('button', { name: 'Add recipe' });
    await addButtons.nth(1).click();

    // Dialog appears
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Add Recipe' })).toBeVisible();

    // Meal type defaults to breakfast (Req 4.4)
    await expect(page.getByRole('combobox')).toHaveValue('breakfast');

    // Recipe list loads (Req 4.2)
    await expect(page.getByRole('option', { name: 'Pancakes' })).toBeVisible({ timeout: 5000 });

    // Select Pancakes (unique — not in the seed) and confirm.
    // Scope to the dialog and use an exact name so the seven "Add recipe"
    // buttons (still in the DOM behind the modal) don't match "Add".
    await page.getByRole('option', { name: 'Pancakes' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();

    // Dialog closes and the new card appears
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Pancakes')).toBeVisible({ timeout: 5000 });
  });

  test('cancelling the Add Recipe dialog does not create a meal plan (Req 4.8)', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Add recipe' }).nth(1).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });
    // No Pancakes card created
    await expect(page.getByText('Pancakes')).not.toBeVisible();
  });

  // ── 3. Navigate weeks ────────────────────────────────────────────────────

  test('Next week shows an empty week, Previous returns to the seeded week (Req 3.2, 3.3)', async ({
    page,
  }) => {
    // Seeded cards are on the current week
    await expect(page.getByText('Pasta Carbonara')).toBeVisible();

    // Advance to next week — no plans there
    await page.getByRole('button', { name: 'Next week' }).click();

    const nextMondayNumber = getDayNumber(addDaysIso(weekStart, 7));
    await expect(page.getByText(String(nextMondayNumber)).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Pasta Carbonara')).not.toBeVisible();

    // Go back — seeded cards return
    await page.getByRole('button', { name: 'Previous week' }).click();
    await expect(page.getByText(String(getDayNumber(weekStart))).first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText('Pasta Carbonara')).toBeVisible({ timeout: 5000 });
  });

  test('Previous then Next week returns to the original week (Req 3.2, 3.3)', async ({ page }) => {
    const currentMondayNumber = getDayNumber(weekStart);

    await page.getByRole('button', { name: 'Previous week' }).click();
    const prevMondayNumber = getDayNumber(addDaysIso(weekStart, -7));
    await expect(page.getByText(String(prevMondayNumber)).first()).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.getByText(String(currentMondayNumber)).first()).toBeVisible({
      timeout: 5000,
    });
  });

  // ── 4. Remove a recipe ──────────────────────────────────────────────────

  test('can remove an existing recipe card and it disappears (Req 5.2, 5.4)', async ({ page }) => {
    await expect(page.getByText('Tomato Soup')).toBeVisible({ timeout: 5000 });

    // Remove the lunch card (Tomato Soup is the second card). Target its remove button.
    const removeButtons = page.getByRole('button', { name: 'Remove assignment' });
    await removeButtons.nth(1).click();

    // After successful delete + re-fetch the card disappears
    await expect(page.getByText('Tomato Soup')).not.toBeVisible({ timeout: 5000 });

    // The DELETE used the lunch plan's id (Req 5.2)
    expect(deletedPlanIds).toContain('plan-lunch');
  });
});
