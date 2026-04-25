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
  createdAt: '2024-01-03T00:00:00Z',
  updatedAt: '2024-01-03T00:00:00Z',
  syncVersion: 1,
};

const updatedRecipe = {
  ...mockRecipes[0],
  name: 'Pasta Carbonara Updated',
  instructions: 'Updated instructions.',
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ field: 'name', query: '', resultType: 'items', items: [], count: 0 }),
    });
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
    await page.getByLabel('Ingredient 1 unit').fill('g');

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
    await expect(page.getByText('Pasta', { exact: true })).toBeVisible();
    await expect(page.getByText('available', { exact: true })).toBeVisible();

    await expect(page.getByText('Eggs', { exact: true })).toBeVisible();
    await expect(page.getByText('have 1 / need 3 Unit')).toBeVisible();

    await expect(page.getByText('Bacon', { exact: true })).toBeVisible();
    await expect(page.getByText('missing', { exact: true })).toBeVisible();

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
});
