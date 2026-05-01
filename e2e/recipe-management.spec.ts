import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Recipe Management
 *
 * Tests the full recipe management flow: list, create, view detail with availability,
 * edit, delete, and search/filter.
 * Requires VITE_MOCK_AUTH=true (set in playwright.config.ts webServer env).
 * Backend API calls are mocked via Playwright route interception.
 */

const mockRecipes = [
  {
    recipeId: 'recipe-1',
    userId: 'test-user',
    name: 'Pasta Carbonara',
    ingredients: [
      { name: 'Pasta', quantity: 200, unit: 'g' },
      { name: 'Eggs', quantity: 3, unit: 'Unit' },
      { name: 'Bacon', quantity: 100, unit: 'g' },
    ],
    instructions: 'Boil pasta. Fry bacon. Mix eggs. Combine.',
    sourceUrl: 'https://example.com/carbonara',
    prepTime: 10,
    cookTime: 20,
    portions: 4,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    syncVersion: 1,
  },
  {
    recipeId: 'recipe-2',
    userId: 'test-user',
    name: 'Tomato Soup',
    ingredients: [
      { name: 'Tomatoes', quantity: 500, unit: 'g' },
      { name: 'Onion', quantity: 1, unit: 'Unit' },
    ],
    instructions: 'Chop tomatoes and onion. Simmer for 20 minutes. Blend.',
    portions: 2,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    syncVersion: 1,
  },
];

const mockRecipeWithAvailability = {
  recipe: mockRecipes[0],
  ingredientAvailability: [
    { name: 'Pasta', required: 200, unit: 'g', available: 200, status: 'available' as const },
    { name: 'Eggs', required: 3, unit: 'Unit', available: 1, status: 'partial' as const },
    { name: 'Bacon', required: 100, unit: 'g', available: 0, status: 'missing' as const },
  ],
  missingCount: 2,
};

const newRecipe = {
  recipeId: 'recipe-new',
  userId: 'test-user',
  name: 'New Test Recipe',
  ingredients: [{ name: 'Flour', quantity: 300, unit: 'g' }],
  instructions: 'Mix and bake.',
  portions: 2,
  createdAt: '2024-01-03T00:00:00Z',
  updatedAt: '2024-01-03T00:00:00Z',
  syncVersion: 1,
};

const updatedRecipe = {
  ...mockRecipes[0],
  name: 'Pasta Carbonara Updated',
  instructions: 'Updated instructions.',
  portions: 4,
  updatedAt: '2024-01-04T00:00:00Z',
};

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
    const url = route.request().url();
    const query = new URL(url).searchParams.get('query') ?? '';
    if (query.length >= 3) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          field: 'name',
          query,
          resultType: 'items',
          items: [{ itemId: 'inv-1', name: 'Flour', category: 'Baking', unit: 'Gram' }],
          count: 1,
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ field: 'name', query, resultType: 'items', items: [], count: 0 }),
      });
    }
  });

  // GET /recipes — list
  await page.route('**/recipes', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recipes: mockRecipes }),
      });
    } else if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ recipe: newRecipe }),
      });
    }
  });

  // GET/PUT/DELETE /recipes/{recipeId}
  await page.route('**/recipes/recipe-1', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockRecipeWithAvailability),
      });
    } else if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recipe: updatedRecipe }),
      });
    } else if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });

  await page.route('**/recipes/recipe-2', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipe: mockRecipes[1],
          ingredientAvailability: [
            { name: 'Tomatoes', required: 500, unit: 'g', available: 500, status: 'available' as const },
            { name: 'Onion', required: 1, unit: 'Unit', available: 1, status: 'available' as const },
          ],
          missingCount: 0,
        }),
      });
    }
  });

  await page.route('**/recipes/recipe-new', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipe: newRecipe,
          ingredientAvailability: [
            { name: 'Flour', required: 300, unit: 'g', available: 0, status: 'missing' as const },
          ],
          missingCount: 1,
        }),
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
  // Wait for inventory page to load, then navigate to Recipes
  await page.waitForSelector('h2:has-text("Inventory")', { timeout: 10000 });
  await page.getByRole('button', { name: 'Recipes' }).click();
  await page.waitForSelector('h2:has-text("Recipes")', { timeout: 10000 });
}

test.describe('Recipe Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
    await loginAndGoToRecipes(page);
  });

  test('navigates to Recipes page from bottom nav', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
    await expect(page.getByText('Pasta Carbonara')).toBeVisible();
    await expect(page.getByText('Tomato Soup')).toBeVisible();
  });

  test('creates a new recipe and verifies it appears in the list', async ({ page }) => {
    // Click New Recipe
    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    // Fill in the form
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('New Test Recipe');
    await page.getByRole('textbox', { name: 'Instructions' }).fill('Mix and bake.');

    // Fill in the first ingredient row
    await page.getByLabel('Ingredient 1 name').fill('Flour');
    await page.getByLabel('Ingredient 1 quantity').fill('300');
    await page.getByLabel('Ingredient 1 unit').selectOption('g');

    // Fill in Portions
    await page.getByLabel('Portions').fill('2');

    // Submit
    await page.getByRole('button', { name: 'Create Recipe' }).click();

    // Should navigate to detail view for the new recipe
    await expect(page.getByRole('heading', { name: 'New Test Recipe' })).toBeVisible({ timeout: 5000 });
  });

  test('views recipe detail with ingredient availability statuses', async ({ page }) => {
    // Click on Pasta Carbonara
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();

    // Should show recipe name
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    // Should show availability summary (2 missing/partial)
    await expect(page.getByText('2 ingredient(s) missing or partial')).toBeVisible();

    // Should show ingredient statuses
    const availability = page.getByLabel('Ingredient availability');
    await expect(availability.getByText('Pasta', { exact: true })).toBeVisible();
    await expect(availability.getByText('available', { exact: true })).toBeVisible();

    await expect(availability.getByText('Eggs', { exact: true })).toBeVisible();
    await expect(availability.getByText('have 1 / need 3 pieces')).toBeVisible();

    await expect(availability.getByText('Bacon', { exact: true })).toBeVisible();
    await expect(availability.getByText('missing', { exact: true })).toBeVisible();

    // Should show instructions
    await expect(page.getByText('Boil pasta. Fry bacon. Mix eggs. Combine.')).toBeVisible();

    // Should show source URL link
    await expect(page.getByRole('link', { name: 'View original recipe' })).toBeVisible();
  });

  test('edits an existing recipe and verifies changes persist', async ({ page }) => {
    // Override the recipe-1 route to return updated data after PUT
    let saved = false;
    await page.route('**/recipes/recipe-1', async (route) => {
      if (route.request().method() === 'PUT') {
        saved = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipe: updatedRecipe }),
        });
      } else if (route.request().method() === 'GET') {
        const responseData = saved
          ? { recipe: updatedRecipe, ingredientAvailability: mockRecipeWithAvailability.ingredientAvailability, missingCount: 2 }
          : mockRecipeWithAvailability;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(responseData),
        });
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
    });

    // Navigate to detail
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    // Click Edit
    await page.getByTestId('edit-button').click();
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible({ timeout: 5000 });

    // Update the name
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Pasta Carbonara Updated');
    await page.getByRole('textbox', { name: 'Instructions' }).fill('Updated instructions.');

    // Save
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Should navigate back to detail view with updated name
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara Updated' })).toBeVisible({ timeout: 5000 });
  });

  test('deletes a recipe and verifies it is removed from the list', async ({ page }) => {
    // Set up a fresh recipes list mock that returns only recipe-2 after deletion
    let deleted = false;
    await page.route('**/recipes', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipes: deleted ? [mockRecipes[1]] : mockRecipes }),
        });
      }
    });

    // Navigate to detail
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    // Click Delete — accept the confirm dialog
    page.once('dialog', (dialog) => {
      deleted = true;
      dialog.accept();
    });
    await page.getByTestId('delete-button').click();

    // Should navigate back to the list
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible({ timeout: 5000 });

    // Pasta Carbonara should no longer be in the list
    await expect(page.getByText('Pasta Carbonara')).not.toBeVisible();
    await expect(page.getByText('Tomato Soup')).toBeVisible();
  });

  test('cancels recipe deletion when user dismisses the confirm dialog', async ({ page }) => {
    // Navigate to detail
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    // Dismiss the confirm dialog
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByTestId('delete-button').click();

    // Should remain on the detail page
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 3000 });
  });

  test('search/filter filters the recipe list by name', async ({ page }) => {
    // Both recipes visible initially
    await expect(page.getByText('Pasta Carbonara')).toBeVisible();
    await expect(page.getByText('Tomato Soup')).toBeVisible();

    // Type in search box
    await page.getByLabel('Search recipes').fill('pasta');

    // Only Pasta Carbonara should be visible
    await expect(page.getByText('Pasta Carbonara')).toBeVisible();
    await expect(page.getByText('Tomato Soup')).not.toBeVisible();
  });

  test('search shows empty state when no recipes match', async ({ page }) => {
    await page.getByLabel('Search recipes').fill('zzznomatch');

    await expect(page.getByText('No recipes match your search.')).toBeVisible();
    await expect(page.getByText('Pasta Carbonara')).not.toBeVisible();
    await expect(page.getByText('Tomato Soup')).not.toBeVisible();
  });

  test('back button from recipe detail returns to recipe list', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Go back' }).click();

    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Pasta Carbonara')).toBeVisible();
  });

  test('cancel button in recipe editor returns to list without saving', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Should Not Be Saved');

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible({ timeout: 3000 });
  });

  test('recipe editor shows validation errors on empty submit', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    // Submit without filling anything
    await page.getByRole('button', { name: 'Create Recipe' }).click();

    await expect(page.getByText('Recipe name is required.')).toBeVisible();
    await expect(page.getByText('Instructions are required.')).toBeVisible();
  });

  test('source URL link opens in new tab', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    const link = page.getByRole('link', { name: 'View original recipe' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('href', 'https://example.com/carbonara');
  });

  test('recipe with all ingredients available shows green summary', async ({ page }) => {
    await page.getByRole('button', { name: 'View Tomato Soup' }).click();
    await expect(page.getByRole('heading', { name: 'Tomato Soup' })).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('All ingredients available')).toBeVisible();
  });

  // ─── Time fields ──────────────────────────────────────────────────────────────

  test('recipe list shows time badge for recipes with time fields', async ({ page }) => {
    // Pasta Carbonara has prepTime: 10, cookTime: 20 → total: 30
    await expect(page.getByLabel('30 minutes total')).toBeVisible();
    // Tomato Soup has no time fields — no badge
    const badges = page.getByLabel(/minutes total/);
    await expect(badges).toHaveCount(1);
  });

  test('recipe list does not show time badge for recipes without time fields', async ({ page }) => {
    // Tomato Soup has no time fields
    const tomatoRow = page.getByRole('button', { name: 'View Tomato Soup' });
    await expect(tomatoRow).toBeVisible();
    // The badge group inside Tomato Soup row should not contain a time badge
    await expect(tomatoRow.getByLabel(/minutes total/)).not.toBeVisible();
  });

  test('recipe detail shows prep, cook, and total time when both fields are set', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    const timeSection = page.getByRole('region', { name: 'Recipe time' });
    await expect(timeSection).toBeVisible();
    await expect(timeSection.getByText(/prep: 10 min/i)).toBeVisible();
    await expect(timeSection.getByText(/cook: 20 min/i)).toBeVisible();
    await expect(timeSection.getByText(/total: 30 min/i)).toBeVisible();
  });

  test('creates a recipe with time fields and detail view shows total time', async ({ page }) => {
    const recipeWithTime = {
      recipeId: 'recipe-timed',
      userId: 'test-user',
      name: 'Timed Recipe',
      ingredients: [{ name: 'Flour', quantity: 300, unit: 'g' }],
      instructions: 'Mix and bake.',
      prepTime: 15,
      cookTime: 25,
      createdAt: '2024-01-03T00:00:00Z',
      updatedAt: '2024-01-03T00:00:00Z',
      syncVersion: 1,
    };

    await page.route('**/recipes', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ recipe: recipeWithTime }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipes: mockRecipes }),
        });
      }
    });

    await page.route('**/recipes/recipe-timed', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipe: recipeWithTime,
          ingredientAvailability: [
            { name: 'Flour', required: 300, unit: 'g', available: 0, status: 'missing' as const },
          ],
          missingCount: 1,
        }),
      });
    });

    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Timed Recipe');
    await page.getByRole('textbox', { name: 'Instructions' }).fill('Mix and bake.');
    await page.getByLabel('Prep time (min)').fill('15');
    await page.getByLabel('Cook time (min)').fill('25');
    await page.getByLabel('Ingredient 1 name').fill('Flour');
    await page.getByLabel('Ingredient 1 quantity').fill('300');
    await page.getByLabel('Ingredient 1 unit').selectOption('g');
    await page.getByLabel('Portions').fill('2');

    await page.getByRole('button', { name: 'Create Recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Timed Recipe' })).toBeVisible({ timeout: 5000 });
    const timeSection = page.getByRole('region', { name: 'Recipe time' });
    await expect(timeSection).toBeVisible();
    await expect(timeSection.getByText(/total: 40 min/i)).toBeVisible();
  });

  test('editing and clearing a time field updates the detail view', async ({ page }) => {
    const updatedWithoutPrepTime = {
      ...mockRecipes[0],
      prepTime: undefined,
      cookTime: 20,
      updatedAt: '2024-01-05T00:00:00Z',
    };

    let saved = false;
    await page.route('**/recipes/recipe-1', async (route) => {
      if (route.request().method() === 'PUT') {
        saved = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipe: updatedWithoutPrepTime }),
        });
      } else if (route.request().method() === 'GET') {
        const responseData = saved
          ? {
              recipe: updatedWithoutPrepTime,
              ingredientAvailability: mockRecipeWithAvailability.ingredientAvailability,
              missingCount: 2,
            }
          : mockRecipeWithAvailability;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(responseData),
        });
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
    });

    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    await page.getByTestId('edit-button').click();
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible({ timeout: 5000 });

    // Verify time fields are pre-populated
    await expect(page.getByLabel('Prep time (min)')).toHaveValue('10');
    await expect(page.getByLabel('Cook time (min)')).toHaveValue('20');

    // Clear prep time
    await page.getByLabel('Prep time (min)').clear();

    await page.getByRole('button', { name: 'Save Changes' }).click();

    // After save, detail view should show only cook time (total = 20)
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    const timeSection = page.getByRole('region', { name: 'Recipe time' });
    await expect(timeSection).toBeVisible();
    await expect(timeSection.getByText(/total: 20 min/i)).toBeVisible();
  });

  test('time field validation error shown for negative number in RecipeEditor', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Test Recipe');
    await page.getByRole('textbox', { name: 'Instructions' }).fill('Do stuff');
    await page.getByLabel('Prep time (min)').fill('-5');
    await page.getByLabel('Ingredient 1 name').fill('Flour');
    await page.getByLabel('Ingredient 1 quantity').fill('100');
    await page.getByLabel('Ingredient 1 unit').selectOption('g');
    await page.getByLabel('Portions').fill('2');

    await page.getByRole('button', { name: 'Create Recipe' }).click();

    // Validation error should appear and form should not submit
    await expect(page.getByText(/prep time must be a non-negative whole number/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible();
  });

  test('ingredient name autocomplete shows inventory suggestions and autofills unit on select', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    // Type 3+ chars to trigger autocomplete (matches by name)
    await page.getByLabel('Ingredient 1 name').fill('Flo');

    // Dropdown should appear with the inventory match
    const option = page.locator('[role="option"]').filter({ hasText: 'Flour' });
    await expect(option).toBeVisible({ timeout: 3000 });

    // Select the option
    await option.click();

    // Name and unit should be autofilled
    await expect(page.getByLabel('Ingredient 1 name')).toHaveValue('Flour');
    await expect(page.getByLabel('Ingredient 1 unit')).toHaveValue('g');
  });

  test('ingredient autocomplete searches across all fields — category match shows items', async ({ page }) => {
    // Override search to return a result only for category field
    await page.route('**/inventory/search**', async (route) => {
      const url = route.request().url();
      const params = new URL(url).searchParams;
      const field = params.get('field') ?? '';
      const query = params.get('query') ?? '';
      if (field === 'category' && query.length >= 3) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            field: 'category',
            query,
            resultType: 'items',
            items: [{ itemId: 'inv-2', name: 'Butter', category: 'Dairy', unit: 'Gram' }],
            count: 1,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ field, query, resultType: 'items', items: [], count: 0 }),
        });
      }
    });

    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    // Type a category name
    await page.getByLabel('Ingredient 1 name').fill('Dai');

    // Dropdown should show the item from the Dairy category
    const option = page.locator('[role="option"]').filter({ hasText: 'Butter' });
    await expect(option).toBeVisible({ timeout: 3000 });

    // Select it
    await option.click();

    await expect(page.getByLabel('Ingredient 1 name')).toHaveValue('Butter');
    await expect(page.getByLabel('Ingredient 1 unit')).toHaveValue('g');
  });

  test('saving recipe with unrecognized ingredient — new item appears in inventory with quantity 0', async ({ page }) => {
    // Track POST /recipes calls
    const recipeRequests: string[] = [];
    await page.route('**/recipes', async (route) => {
      if (route.request().method() === 'POST') {
        recipeRequests.push(route.request().url());
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            recipe: {
              recipeId: 'recipe-new2',
              userId: 'test-user',
              name: 'Mystery Stew',
              ingredients: [{ name: 'Dragon Fruit', quantity: 1, unit: 'Unit' }],
              instructions: 'Cook it.',
              createdAt: '2024-01-05T00:00:00Z',
              updatedAt: '2024-01-05T00:00:00Z',
              syncVersion: 1,
            },
          }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipes: mockRecipes }),
        });
      }
    });

    // Mock the detail view for the new recipe
    await page.route('**/recipes/recipe-new2', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipe: {
            recipeId: 'recipe-new2',
            name: 'Mystery Stew',
            ingredients: [{ name: 'Dragon Fruit', quantity: 1, unit: 'Unit' }],
            instructions: 'Cook it.',
          },
          ingredientAvailability: [
            { name: 'Dragon Fruit', required: 1, unit: 'Unit', available: 0, status: 'missing' as const },
          ],
          missingCount: 1,
        }),
      });
    });

    // Mock inventory to return the auto-created placeholder after recipe save
    await page.route('**/inventory', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [{
              itemId: 'auto-1',
              name: 'Dragon Fruit',
              category: 'Uncategorized',
              quantity: 0,
              unit: 'Unit',
              isLowStock: true,
              location: 'unknown',
              expirationDate: '2099-12-31',
            }],
          }),
        });
      }
    });

    // Create the recipe
    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Mystery Stew');
    await page.getByRole('textbox', { name: 'Instructions' }).fill('Cook it.');
    await page.getByLabel('Ingredient 1 name').fill('Dragon Fruit');
    await page.getByLabel('Ingredient 1 quantity').fill('1');
    await page.getByLabel('Ingredient 1 unit').selectOption('piece');
    await page.getByLabel('Portions').fill('2');

    await page.getByRole('button', { name: 'Create Recipe' }).click();

    // Should navigate to detail — ingredient shows as missing (quantity 0)
    await expect(page.getByRole('heading', { name: 'Mystery Stew' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('1 ingredient(s) missing or partial')).toBeVisible();
    await expect(page.getByText('missing', { exact: true })).toBeVisible();

    // Navigate to Inventory page and verify the auto-created placeholder is there
    await page.getByRole('button', { name: 'Inventory' }).click();
    await page.waitForSelector('h2:has-text("Inventory")', { timeout: 5000 });

    // The auto-created item should appear under the "Uncategorized" category card
    await expect(page.getByText('Uncategorized')).toBeVisible({ timeout: 3000 });
    // Click the Uncategorized category to drill in
    await page.getByText('Uncategorized').click();
    await expect(page.getByText('Dragon Fruit')).toBeVisible({ timeout: 3000 });
  });

  // ─── Portions counter ─────────────────────────────────────────────────────────

  test('creates a recipe with a portions value and detail view shows portions scaler', async ({ page }) => {
    const recipeWithPortions = {
      recipeId: 'recipe-portions',
      userId: 'test-user',
      name: 'Portioned Recipe',
      ingredients: [{ name: 'Flour', quantity: 300, unit: 'g' }],
      instructions: 'Mix and bake.',
      portions: 4,
      createdAt: '2024-01-03T00:00:00Z',
      updatedAt: '2024-01-03T00:00:00Z',
      syncVersion: 1,
    };

    await page.route('**/recipes', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ recipe: recipeWithPortions }),
        });
      } else if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipes: mockRecipes }),
        });
      }
    });

    await page.route('**/recipes/recipe-portions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipe: recipeWithPortions,
          ingredientAvailability: [
            { name: 'Flour', required: 300, unit: 'g', available: 0, status: 'missing' as const },
          ],
          missingCount: 1,
        }),
      });
    });

    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Portioned Recipe');
    await page.getByRole('textbox', { name: 'Instructions' }).fill('Mix and bake.');
    await page.getByLabel('Ingredient 1 name').fill('Flour');
    await page.getByLabel('Ingredient 1 quantity').fill('300');
    await page.getByLabel('Ingredient 1 unit').selectOption('g');
    await page.getByLabel('Portions').fill('4');

    await page.getByRole('button', { name: 'Create Recipe' }).click();

    // Should navigate to detail view
    await expect(page.getByRole('heading', { name: 'Portioned Recipe' })).toBeVisible({ timeout: 5000 });

    // Portions scaler section should be visible and initialised to 4
    const portionsSection = page.getByRole('region', { name: 'Portions' });
    await expect(portionsSection).toBeVisible();
    await expect(portionsSection.getByText('4')).toBeVisible();
  });

  test('portions validation error shown when portions is empty in RecipeEditor', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible({ timeout: 5000 });

    // Fill in all required fields except Portions
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Test Recipe');
    await page.getByRole('textbox', { name: 'Instructions' }).fill('Do stuff.');
    await page.getByLabel('Ingredient 1 name').fill('Flour');
    await page.getByLabel('Ingredient 1 quantity').fill('100');
    await page.getByLabel('Ingredient 1 unit').selectOption('g');
    // Leave Portions empty

    await page.getByRole('button', { name: 'Create Recipe' }).click();

    // Inline validation error should appear
    await expect(page.getByText('Portions is required.')).toBeVisible();

    // Form should still be on the New Recipe page (not submitted)
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible();
  });

  test('portions scaler in RecipeDetail increments and decrements without API call', async ({ page }) => {
    // Track all requests to recipe-1
    const recipe1Requests: string[] = [];
    await page.route('**/recipes/recipe-1', async (route) => {
      recipe1Requests.push(route.request().method());
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockRecipeWithAvailability),
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipe: updatedRecipe }),
        });
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
    });

    // Navigate to Pasta Carbonara detail view
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    // Portions scaler section should be visible with initial value 4
    const portionsSection = page.getByRole('region', { name: 'Portions' });
    await expect(portionsSection).toBeVisible();
    await expect(portionsSection.getByText('4')).toBeVisible();

    // Record how many GET requests were made before interacting with the scaler
    const requestsBeforeScaling = recipe1Requests.length;

    // Click + (Increase portions)
    await page.getByRole('button', { name: 'Increase portions' }).click();

    // Value should show 5
    await expect(portionsSection.getByText('5')).toBeVisible();

    // No additional network request should have been made
    expect(recipe1Requests.length).toBe(requestsBeforeScaling);

    // Click – (Decrease portions)
    await page.getByRole('button', { name: 'Decrease portions' }).click();

    // Value should show 4 again
    await expect(portionsSection.getByText('4')).toBeVisible();
  });

  test('portions scaler in RecipeEditor edit mode updates ingredient quantities and saves', async ({ page }) => {
    const scaledRecipe = {
      ...mockRecipes[0],
      portions: 5,
      ingredients: [
        { name: 'Pasta', quantity: 250, unit: 'g' },
        { name: 'Eggs', quantity: 3.75, unit: 'Unit' },
        { name: 'Bacon', quantity: 125, unit: 'g' },
      ],
      name: 'Pasta Carbonara',
      instructions: 'Boil pasta. Fry bacon. Mix eggs. Combine.',
      updatedAt: '2024-01-04T00:00:00Z',
    };

    await page.route('**/recipes/recipe-1', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockRecipeWithAvailability),
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipe: scaledRecipe }),
        });
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
    });

    // Navigate to Pasta Carbonara detail, click Edit
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    await page.getByTestId('edit-button').click();
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible({ timeout: 5000 });

    // Portions scaler should show 4 portions
    await expect(page.getByText('4 portions')).toBeVisible();

    // Click + (Increase portions)
    await page.getByRole('button', { name: 'Increase portions' }).click();

    // Portions scaler should show 5 portions
    await expect(page.getByText('5 portions')).toBeVisible();

    // Ingredient quantity for Pasta should be recalculated: 200 * 5/4 = 250
    await expect(page.getByLabel('Ingredient 1 quantity')).toHaveValue('250');

    // Save
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Should navigate back to detail view with updated recipe
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
  });

  test('recipe list shows portions badge for recipes with portions value', async ({ page }) => {
    // Pasta Carbonara has portions: 4
    await expect(page.getByLabel('4 portions')).toBeVisible();

    // Tomato Soup has portions: 2
    await expect(page.getByLabel('2 portions')).toBeVisible();
  });
});
