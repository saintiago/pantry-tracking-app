import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Recipe Search & Filter
 *
 * Tests the RecipeFilterPanel: max prep/cook/total time filters, the
 * "Only recipes I can make now" toggle, inline validation errors, the
 * "Clear filters" action, combined filters, empty-state messages, and
 * filter reset on navigation.
 *
 * Requires VITE_MOCK_AUTH=true (set in playwright.config.ts webServer env).
 * Backend API calls are mocked via Playwright route interception.
 */

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockRecipes = [
  {
    recipeId: 'recipe-1',
    userId: 'test-user',
    name: 'Quick Pasta',
    tags: ['italian'],
    ingredients: [
      { name: 'Pasta', quantity: 200, unit: 'g' },
      { name: 'Eggs', quantity: 3, unit: 'Unit' },
    ],
    instructions: 'Boil pasta. Mix eggs.',
    prepTime: 5,
    cookTime: 10,
    portions: 2,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    syncVersion: 1,
  },
  {
    recipeId: 'recipe-2',
    userId: 'test-user',
    name: 'Slow Roast',
    tags: ['meat'],
    ingredients: [
      { name: 'Beef', quantity: 500, unit: 'g' },
    ],
    instructions: 'Roast for 3 hours.',
    prepTime: 20,
    cookTime: 180,
    portions: 4,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    syncVersion: 1,
  },
  {
    recipeId: 'recipe-3',
    userId: 'test-user',
    name: 'No Time Recipe',
    tags: ['quick'],
    ingredients: [
      { name: 'Bread', quantity: 2, unit: 'Unit' },
    ],
    instructions: 'Just eat it.',
    // no prepTime or cookTime
    portions: 1,
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
    syncVersion: 1,
  },
  {
    recipeId: 'recipe-4',
    userId: 'test-user',
    name: 'Pantry Salad',
    tags: ['vegetarian', 'quick'],
    ingredients: [
      { name: 'Lettuce', quantity: 1, unit: 'Unit' },
      { name: 'Tomato', quantity: 2, unit: 'Unit' },
    ],
    instructions: 'Toss together.',
    prepTime: 10,
    cookTime: 0,
    portions: 2,
    createdAt: '2024-01-04T00:00:00Z',
    updatedAt: '2024-01-04T00:00:00Z',
    syncVersion: 1,
  },
];

// Inventory: has Pasta, Eggs, Lettuce, Tomato — but NOT Beef or Bread
const mockInventoryItems = [
  { itemId: 'inv-1', name: 'Pasta', category: 'Dry Goods', quantity: 500, unit: 'g', location: 'pantry', expirationDate: '2025-12-31', isLowStock: false, userId: 'test-user', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', syncVersion: 1 },
  { itemId: 'inv-2', name: 'Eggs', category: 'Dairy', quantity: 6, unit: 'Unit', location: 'fridge', expirationDate: '2025-12-31', isLowStock: false, userId: 'test-user', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', syncVersion: 1 },
  { itemId: 'inv-3', name: 'Lettuce', category: 'Produce', quantity: 2, unit: 'Unit', location: 'fridge', expirationDate: '2025-12-31', isLowStock: false, userId: 'test-user', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', syncVersion: 1 },
  { itemId: 'inv-4', name: 'Tomato', category: 'Produce', quantity: 4, unit: 'Unit', location: 'fridge', expirationDate: '2025-12-31', isLowStock: false, userId: 'test-user', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', syncVersion: 1 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function setupMockAPI(page: Page) {
  await page.route('**/auth/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true, userId: 'test-user' }),
    });
  });

  await page.route('**/locations', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ locations: [] }),
    });
  });

  await page.route('**/inventory', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: mockInventoryItems }),
      });
    }
  });

  await page.route('**/inventory/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ field: 'name', query: '', resultType: 'items', items: [], count: 0 }),
    });
  });

  await page.route('**/recipes/tags', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tags: ['italian', 'meat', 'quick', 'vegetarian'] }),
    });
  });

  await page.route('**/recipes', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recipes: mockRecipes }),
      });
    }
  });

  // Individual recipe detail routes
  for (const recipe of mockRecipes) {
    await page.route(`**/${recipe.recipeId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            recipe,
            ingredientAvailability: recipe.ingredients.map((ing) => ({
              name: ing.name,
              required: ing.quantity,
              unit: ing.unit,
              available: 0,
              status: 'missing' as const,
            })),
            missingCount: recipe.ingredients.length,
          }),
        });
      }
    });
  }
}

async function loginAndGoToRecipes(page: Page) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('h2:has-text("Inventory")', { timeout: 10000 });
  await page.getByRole('button', { name: 'Recipes' }).click();
  await page.waitForSelector('h2:has-text("Recipes")', { timeout: 10000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Recipe Search & Filter', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
    await loginAndGoToRecipes(page);
  });

  // ── Filter panel presence ─────────────────────────────────────────────────

  test('filter panel is visible on the recipes list page', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Recipe filters' })).toBeVisible();
    await expect(page.getByLabel('Max prep time (min)')).toBeVisible();
    await expect(page.getByLabel('Max cook time (min)')).toBeVisible();
    await expect(page.getByLabel('Max total time (min)')).toBeVisible();
    await expect(page.getByLabel('Only recipes I can make now')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  });

  test('"Clear filters" button is disabled when no filters are active', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeDisabled();
  });

  // ── Max prep time filter ──────────────────────────────────────────────────

  test('max prep time filter shows only recipes within the limit', async ({ page }) => {
    // All 4 recipes visible initially
    await expect(page.getByText('Quick Pasta')).toBeVisible();
    await expect(page.getByText('Slow Roast')).toBeVisible();
    await expect(page.getByText('Pantry Salad')).toBeVisible();

    // Set max prep time to 10 — Quick Pasta (5) and Pantry Salad (10) pass;
    // Slow Roast (20) and No Time Recipe (undefined) are excluded
    await page.getByLabel('Max prep time (min)').fill('10');

    await expect(page.getByText('Quick Pasta')).toBeVisible();
    await expect(page.getByText('Pantry Salad')).toBeVisible();
    await expect(page.getByText('Slow Roast')).not.toBeVisible();
    await expect(page.getByText('No Time Recipe')).not.toBeVisible();
  });

  test('max prep time filter excludes recipes with no prepTime', async ({ page }) => {
    await page.getByLabel('Max prep time (min)').fill('999');

    // No Time Recipe has no prepTime — excluded even with a very high limit
    await expect(page.getByText('No Time Recipe')).not.toBeVisible();
    await expect(page.getByText('Quick Pasta')).toBeVisible();
  });

  // ── Max cook time filter ──────────────────────────────────────────────────

  test('max cook time filter shows only recipes within the limit', async ({ page }) => {
    // Set max cook time to 15 — Quick Pasta (10) and Pantry Salad (0) pass;
    // Slow Roast (180) and No Time Recipe (undefined) are excluded
    await page.getByLabel('Max cook time (min)').fill('15');

    await expect(page.getByText('Quick Pasta')).toBeVisible();
    await expect(page.getByText('Pantry Salad')).toBeVisible();
    await expect(page.getByText('Slow Roast')).not.toBeVisible();
    await expect(page.getByText('No Time Recipe')).not.toBeVisible();
  });

  // ── Max total time filter ─────────────────────────────────────────────────

  test('max total time filter uses computed total (prep + cook)', async ({ page }) => {
    // Quick Pasta: 5 + 10 = 15 total
    // Pantry Salad: 10 + 0 = 10 total
    // Slow Roast: 20 + 180 = 200 total
    // No Time Recipe: undefined total
    await page.getByLabel('Max total time (min)').fill('20');

    await expect(page.getByText('Quick Pasta')).toBeVisible();
    await expect(page.getByText('Pantry Salad')).toBeVisible();
    await expect(page.getByText('Slow Roast')).not.toBeVisible();
    await expect(page.getByText('No Time Recipe')).not.toBeVisible();
  });

  test('max total time filter excludes recipes with no time fields', async ({ page }) => {
    await page.getByLabel('Max total time (min)').fill('999');

    // No Time Recipe has neither prepTime nor cookTime — excluded
    await expect(page.getByText('No Time Recipe')).not.toBeVisible();
    await expect(page.getByText('Quick Pasta')).toBeVisible();
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  test('negative number in prep time input shows inline validation error and does not filter', async ({ page }) => {
    await page.getByLabel('Max prep time (min)').fill('-5');

    // Inline error appears
    await expect(page.getByText('Enter a non-negative whole number.')).toBeVisible();

    // Filter is NOT applied — all recipes still visible
    await expect(page.getByText('Quick Pasta')).toBeVisible();
    await expect(page.getByText('Slow Roast')).toBeVisible();
    await expect(page.getByText('No Time Recipe')).toBeVisible();
    await expect(page.getByText('Pantry Salad')).toBeVisible();
  });

  test('decimal number in cook time input shows inline validation error', async ({ page }) => {
    await page.getByLabel('Max cook time (min)').fill('1.5');

    await expect(page.getByText('Enter a non-negative whole number.')).toBeVisible();

    // Filter is NOT applied
    await expect(page.getByText('Quick Pasta')).toBeVisible();
    await expect(page.getByText('Slow Roast')).toBeVisible();
  });

  test('decimal number in total time input shows inline validation error', async ({ page }) => {
    // Decimals are accepted by input[type=number] but rejected by validateMaxTimeInput
    await page.getByLabel('Max total time (min)').fill('1.5');

    await expect(page.getByText('Enter a non-negative whole number.')).toBeVisible();

    // Filter is NOT applied
    await expect(page.getByText('Quick Pasta')).toBeVisible();
    await expect(page.getByText('Slow Roast')).toBeVisible();
  });

  // ── "Only recipes I can make now" toggle ─────────────────────────────────

  test('"Only recipes I can make now" shows only recipes with all ingredients in inventory', async ({ page }) => {
    // Inventory has: Pasta, Eggs, Lettuce, Tomato
    // Quick Pasta needs Pasta + Eggs → available ✓
    // Pantry Salad needs Lettuce + Tomato → available ✓
    // Slow Roast needs Beef → NOT in inventory ✗
    // No Time Recipe needs Bread → NOT in inventory ✗
    await page.getByLabel('Only recipes I can make now').click();

    await expect(page.getByText('Quick Pasta')).toBeVisible();
    await expect(page.getByText('Pantry Salad')).toBeVisible();
    await expect(page.getByText('Slow Roast')).not.toBeVisible();
    await expect(page.getByText('No Time Recipe')).not.toBeVisible();
  });

  test('toggling "Only recipes I can make now" off restores the full list', async ({ page }) => {
    const toggle = page.getByLabel('Only recipes I can make now');
    await toggle.click();

    // Only available recipes shown
    await expect(page.getByText('Slow Roast')).not.toBeVisible();

    // Toggle off
    await toggle.click();

    // All recipes restored
    await expect(page.getByText('Quick Pasta')).toBeVisible();
    await expect(page.getByText('Slow Roast')).toBeVisible();
    await expect(page.getByText('No Time Recipe')).toBeVisible();
    await expect(page.getByText('Pantry Salad')).toBeVisible();
  });

  // ── Clear filters ─────────────────────────────────────────────────────────

  test('"Clear filters" resets all filter inputs and restores the full list', async ({ page }) => {
    // Activate multiple filters
    await page.getByLabel('Max prep time (min)').fill('5');
    await page.getByLabel('Only recipes I can make now').click();

    // Verify filters are active
    await expect(page.getByText('Slow Roast')).not.toBeVisible();

    // Clear
    await page.getByRole('button', { name: 'Clear filters' }).click();

    // All inputs reset
    await expect(page.getByLabel('Max prep time (min)')).toHaveValue('');
    await expect(page.getByLabel('Only recipes I can make now')).not.toBeChecked();

    // Full list restored
    await expect(page.getByText('Quick Pasta')).toBeVisible();
    await expect(page.getByText('Slow Roast')).toBeVisible();
    await expect(page.getByText('No Time Recipe')).toBeVisible();
    await expect(page.getByText('Pantry Salad')).toBeVisible();
  });

  test('"Clear filters" button becomes enabled when a filter is active', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeDisabled();

    await page.getByLabel('Max cook time (min)').fill('30');

    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeEnabled();
  });

  // ── Combined filters ──────────────────────────────────────────────────────

  test('name search and time filter combine with AND logic', async ({ page }) => {
    // Search for "pasta" — matches Quick Pasta only (among time-filtered results)
    await page.getByLabel('Search recipes').fill('pasta');
    await page.getByLabel('Max prep time (min)').fill('10');

    // Quick Pasta: name matches, prepTime 5 ≤ 10 ✓
    await expect(page.getByText('Quick Pasta')).toBeVisible();
    // Slow Roast: name doesn't match "pasta"
    await expect(page.getByText('Slow Roast')).not.toBeVisible();
    // Pantry Salad: name doesn't match "pasta"
    await expect(page.getByText('Pantry Salad')).not.toBeVisible();
  });

  test('tag filter and availability toggle combine with AND logic', async ({ page }) => {
    // Click the "quick" tag — matches No Time Recipe and Pantry Salad
    // Use exact: true to avoid matching "View Quick Pasta" button
    await page.getByRole('button', { name: 'quick', exact: true }).click();

    // Then activate availability toggle — Pantry Salad has all ingredients, No Time Recipe does not
    await page.getByLabel('Only recipes I can make now').click();

    await expect(page.getByText('Pantry Salad')).toBeVisible();
    await expect(page.getByText('No Time Recipe')).not.toBeVisible();
    await expect(page.getByText('Quick Pasta')).not.toBeVisible(); // doesn't have "quick" tag
    await expect(page.getByText('Slow Roast')).not.toBeVisible();
  });

  // ── Empty state messages ──────────────────────────────────────────────────

  test('shows "No recipes match the selected filters." when filters produce empty result', async ({ page }) => {
    // Set max prep time to 0 — no recipe has prepTime of 0 (Quick Pasta has 5)
    await page.getByLabel('Max prep time (min)').fill('0');

    await expect(page.getByText('No recipes match the selected filters.')).toBeVisible();
    await expect(page.getByText('Quick Pasta')).not.toBeVisible();
  });

  test('filter empty-state message does not appear when recipe list is empty', async ({ page }) => {
    // Override the recipes route BEFORE navigating so the empty list is served on load.
    // page.route() uses LIFO order, so this registration takes precedence over beforeEach.
    await page.route('**/recipes', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipes: [] }),
        });
      }
    });

    // Navigate fresh — the override is already in place
    await page.goto('/');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForSelector('h2:has-text("Inventory")', { timeout: 10000 });
    await page.getByRole('button', { name: 'Recipes' }).click();
    await page.waitForSelector('h2:has-text("Recipes")', { timeout: 10000 });

    await expect(page.getByText(/no recipes yet/i)).toBeVisible();
    await expect(page.getByText('No recipes match the selected filters.')).not.toBeVisible();
  });

  // ── Filter reset on navigation ────────────────────────────────────────────

  test('filter inputs reset when navigating to detail and back', async ({ page }) => {
    // Set a filter
    await page.getByLabel('Max prep time (min)').fill('10');
    await expect(page.getByLabel('Max prep time (min)')).toHaveValue('10');

    // Navigate to detail
    await page.getByRole('button', { name: 'View Quick Pasta' }).click();
    await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible({ timeout: 5000 });

    // Navigate back
    await page.getByRole('button', { name: 'Go back' }).click();
    await page.waitForSelector('h2:has-text("Recipes")', { timeout: 5000 });

    // Filter inputs should be reset
    await expect(page.getByLabel('Max prep time (min)')).toHaveValue('');
    await expect(page.getByLabel('Only recipes I can make now')).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeDisabled();
  });
});
