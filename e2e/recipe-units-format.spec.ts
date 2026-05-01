import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Recipe Units Format
 *
 * Tests the new cooking unit system: expanded unit dropdown, fractional quantity
 * input/display, singular/plural unit labels, and legacy unit resolution.
 * Requires VITE_MOCK_AUTH=true (set in playwright.config.ts webServer env).
 * Backend API calls are mocked via Playwright route interception.
 */

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockRecipeWithFractionalQty = {
  recipeId: 'recipe-frac',
  userId: 'test-user',
  name: 'Fractional Recipe',
  ingredients: [{ name: 'Flour', quantity: 0.5, unit: 'cup' }],
  instructions: 'Mix well.',
  portions: 2,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  syncVersion: 1,
};

const mockRecipeWithMixedNumber = {
  recipeId: 'recipe-mixed',
  userId: 'test-user',
  name: 'Mixed Number Recipe',
  ingredients: [{ name: 'Milk', quantity: 1.5, unit: 'cup' }],
  instructions: 'Pour and stir.',
  portions: 2,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  syncVersion: 1,
};

const mockRecipeWithSingularQty = {
  recipeId: 'recipe-singular',
  userId: 'test-user',
  name: 'Singular Recipe',
  ingredients: [{ name: 'Butter', quantity: 1, unit: 'cup' }],
  instructions: 'Melt it.',
  portions: 2,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  syncVersion: 1,
};

const mockRecipeWithLegacyUnit = {
  recipeId: 'recipe-legacy',
  userId: 'test-user',
  name: 'Legacy Unit Recipe',
  ingredients: [{ name: 'Sugar', quantity: 100, unit: 'Gram' }],
  instructions: 'Dissolve in water.',
  portions: 2,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  syncVersion: 1,
};

const mockRecipes = [mockRecipeWithLegacyUnit];

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
        body: JSON.stringify({ items: [] }),
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

  await page.route('**/recipes', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recipes: mockRecipes }),
      });
    }
  });
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

async function loginAndGoToAddItem(page: Page) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('h2:has-text("Inventory")', { timeout: 10000 });
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
  await page.waitForSelector('h2:has-text("Add Item")', { timeout: 10000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Recipe Units Format', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
  });

  // ── Test 1: Unit dropdown in RecipeEditor shows new cooking units ────────────

  test('unit dropdown in RecipeEditor shows new cooking units', async ({ page }) => {
    await loginAndGoToRecipes(page);

    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    const unitSelect = page.getByLabel('Ingredient 1 unit');

    // New units should be present (singular labels)
    await expect(unitSelect.locator('option', { hasText: 'teaspoon' })).toBeAttached();
    await expect(unitSelect.locator('option', { hasText: 'cup' })).toBeAttached();
    await expect(unitSelect.locator('option:text-is("gram")')).toBeAttached();
    await expect(unitSelect.locator('option', { hasText: 'kilogram' })).toBeAttached();
    await expect(unitSelect.locator('option', { hasText: 'piece' })).toBeAttached();

    // Old legacy labels should NOT be present as option text (exact match to avoid substring hits)
    await expect(unitSelect.locator('option:text-is("Gram")')).not.toBeAttached();
    await expect(unitSelect.locator('option:text-is("Unit")')).not.toBeAttached();
  });

  // ── Test 2: Fractional quantity input accepted and displayed ─────────────────

  test('fractional quantity input accepted and displayed', async ({ page }) => {
    // Mock POST /recipes to return the fractional recipe
    await page.route('**/recipes', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ recipe: mockRecipeWithFractionalQty }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipes: mockRecipes }),
        });
      }
    });

    // Mock GET /recipes/recipe-frac for detail view
    await page.route('**/recipes/recipe-frac', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipe: mockRecipeWithFractionalQty,
          ingredientAvailability: [
            { name: 'Flour', required: 0.5, unit: 'cup', available: 0, status: 'missing' as const },
          ],
          missingCount: 1,
        }),
      });
    });

    await loginAndGoToRecipes(page);

    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Fractional Recipe');
    await page.getByRole('textbox', { name: 'Instructions' }).fill('Mix well.');
    await page.getByLabel('Ingredient 1 name').fill('Flour');
    // Enter fractional quantity as text
    await page.getByLabel('Ingredient 1 quantity').fill('1/2');
    await page.getByLabel('Ingredient 1 unit').selectOption('cup');
    await page.getByLabel('Portions').fill('2');

    await page.getByRole('button', { name: 'Create Recipe' }).click();

    // Should navigate to detail view
    await expect(page.getByRole('heading', { name: 'Fractional Recipe' })).toBeVisible({ timeout: 5000 });

    // Ingredient should display "1/2 cups" (plural because 0.5 ≠ 1)
    const ingredientsSection = page.getByRole('region', { name: 'Ingredients' });
    await expect(ingredientsSection.getByText('1/2 cups')).toBeVisible();
  });

  // ── Test 3: Mixed number quantity input accepted and displayed ───────────────

  test('mixed number quantity input accepted and displayed', async ({ page }) => {
    await page.route('**/recipes', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ recipe: mockRecipeWithMixedNumber }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipes: mockRecipes }),
        });
      }
    });

    await page.route('**/recipes/recipe-mixed', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipe: mockRecipeWithMixedNumber,
          ingredientAvailability: [
            { name: 'Milk', required: 1.5, unit: 'cup', available: 0, status: 'missing' as const },
          ],
          missingCount: 1,
        }),
      });
    });

    await loginAndGoToRecipes(page);

    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Mixed Number Recipe');
    await page.getByRole('textbox', { name: 'Instructions' }).fill('Pour and stir.');
    await page.getByLabel('Ingredient 1 name').fill('Milk');
    await page.getByLabel('Ingredient 1 quantity').fill('1 1/2');
    await page.getByLabel('Ingredient 1 unit').selectOption('cup');
    await page.getByLabel('Portions').fill('2');

    await page.getByRole('button', { name: 'Create Recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Mixed Number Recipe' })).toBeVisible({ timeout: 5000 });

    // Ingredient should display "1 1/2 cups"
    const ingredientsSection = page.getByRole('region', { name: 'Ingredients' });
    await expect(ingredientsSection.getByText('1 1/2 cups')).toBeVisible();
  });

  // ── Test 4: Singular unit label when quantity is 1 ───────────────────────────

  test('singular unit label when quantity is 1', async ({ page }) => {
    await page.route('**/recipes', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ recipe: mockRecipeWithSingularQty }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipes: mockRecipes }),
        });
      }
    });

    await page.route('**/recipes/recipe-singular', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipe: mockRecipeWithSingularQty,
          ingredientAvailability: [
            { name: 'Butter', required: 1, unit: 'cup', available: 0, status: 'missing' as const },
          ],
          missingCount: 1,
        }),
      });
    });

    await loginAndGoToRecipes(page);

    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Singular Recipe');
    await page.getByRole('textbox', { name: 'Instructions' }).fill('Melt it.');
    await page.getByLabel('Ingredient 1 name').fill('Butter');
    await page.getByLabel('Ingredient 1 quantity').fill('1');
    await page.getByLabel('Ingredient 1 unit').selectOption('cup');
    await page.getByLabel('Portions').fill('2');

    await page.getByRole('button', { name: 'Create Recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Singular Recipe' })).toBeVisible({ timeout: 5000 });

    // Ingredient should display "1 cup" (singular because quantity === 1)
    const ingredientsSection = page.getByRole('region', { name: 'Ingredients' });
    await expect(ingredientsSection.getByText('1 cup')).toBeVisible();
    // Should NOT show "1 cups"
    await expect(ingredientsSection.getByText('1 cups')).not.toBeVisible();
  });

  // ── Test 5: Invalid fractional quantity shows validation error ───────────────

  test('invalid fractional quantity shows validation error', async ({ page }) => {
    await loginAndGoToRecipes(page);

    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Test Recipe');
    await page.getByRole('textbox', { name: 'Instructions' }).fill('Do stuff.');
    await page.getByLabel('Ingredient 1 name').fill('Flour');
    // Enter invalid quantity
    await page.getByLabel('Ingredient 1 quantity').fill('abc');
    await page.getByLabel('Ingredient 1 unit').selectOption('cup');
    await page.getByLabel('Portions').fill('2');

    await page.getByRole('button', { name: 'Create Recipe' }).click();

    // Validation error should appear
    await expect(
      page.getByText('Enter a valid quantity (e.g. 1, 1/2, 1 1/4).'),
    ).toBeVisible();

    // Form should NOT have navigated away — still on New Recipe page
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible();
  });

  // ── Test 6: Legacy unit in existing recipe resolves correctly in detail view ─

  test('legacy unit in existing recipe resolves correctly in detail view', async ({ page }) => {
    await page.route('**/recipes/recipe-legacy', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipe: mockRecipeWithLegacyUnit,
          ingredientAvailability: [
            { name: 'Sugar', required: 100, unit: 'Gram', available: 0, status: 'missing' as const },
          ],
          missingCount: 1,
        }),
      });
    });

    await loginAndGoToRecipes(page);

    // Navigate to the legacy unit recipe detail
    await page.getByRole('button', { name: 'View Legacy Unit Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Legacy Unit Recipe' })).toBeVisible({ timeout: 5000 });

    // Should display "100 grams" (resolved from "Gram" → "g" → "grams")
    const ingredientsSection = page.getByRole('region', { name: 'Ingredients' });
    await expect(ingredientsSection.getByText('100 grams')).toBeVisible();

    // Should NOT display the raw legacy key "Gram"
    await expect(ingredientsSection.getByText('100 Gram', { exact: true })).not.toBeVisible();
  });

  // ── Test 7: Legacy unit in existing recipe pre-selects resolved unit in editor

  test('legacy unit in existing recipe pre-selects resolved unit in editor', async ({ page }) => {
    await page.route('**/recipes/recipe-legacy', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            recipe: mockRecipeWithLegacyUnit,
            ingredientAvailability: [
              { name: 'Sugar', required: 100, unit: 'Gram', available: 0, status: 'missing' as const },
            ],
            missingCount: 1,
          }),
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipe: mockRecipeWithLegacyUnit }),
        });
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
    });

    await loginAndGoToRecipes(page);

    await page.getByRole('button', { name: 'View Legacy Unit Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Legacy Unit Recipe' })).toBeVisible({ timeout: 5000 });

    // Open the editor
    await page.getByTestId('edit-button').click();
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible({ timeout: 5000 });

    // The unit dropdown for ingredient 1 should have "g" selected (resolved from "Gram")
    // "g" maps to the singular label "gram" in the dropdown
    const unitSelect = page.getByLabel('Ingredient 1 unit');
    await expect(unitSelect).toHaveValue('g');

    // Should NOT have "Gram" or empty string selected
    await expect(unitSelect).not.toHaveValue('Gram');
    await expect(unitSelect).not.toHaveValue('');
  });

  // ── Test 8: Unit dropdown in AddItemPage shows new cooking units ─────────────

  test('unit dropdown in AddItemPage shows new cooking units', async ({ page }) => {
    await loginAndGoToAddItem(page);

    const unitSelect = page.getByLabel('Unit');

    // New units should be present (singular labels)
    await expect(unitSelect.locator('option', { hasText: 'teaspoon' })).toBeAttached();
    await expect(unitSelect.locator('option', { hasText: 'cup' })).toBeAttached();
    await expect(unitSelect.locator('option:text-is("gram")')).toBeAttached();

    // Old legacy labels should NOT be present as option text (exact match to avoid substring hits)
    await expect(unitSelect.locator('option:text-is("Gram")')).not.toBeAttached();
    await expect(unitSelect.locator('option:text-is("Unit")')).not.toBeAttached();
  });
});
