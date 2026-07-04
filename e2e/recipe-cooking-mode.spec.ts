import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Recipe Cooking Mode
 *
 * Tests the cooking mode session lifecycle: starting a session, navigating steps,
 * finishing, session persistence across page navigation, and the global
 * "Return to Cooking" banner.
 *
 * Requires VITE_MOCK_AUTH=true (set in playwright.config.ts webServer env).
 * Backend API calls are mocked via Playwright route interception.
 */

const mockRecipes = [
  {
    recipeId: 'recipe-1',
    userId: 'test-user',
    name: 'Pasta Carbonara',
    tags: ['italian', 'quick'],
    ingredients: [
      { name: 'Pasta', quantity: 200, unit: 'g' },
      { name: 'Eggs', quantity: 3, unit: 'Unit' },
      { name: 'Bacon', quantity: 100, unit: 'g' },
    ],
    instructions: ['Boil pasta', 'Fry bacon', 'Mix eggs and cheese', 'Combine all ingredients', 'Serve immediately'],
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
    tags: ['soup', 'vegetarian'],
    ingredients: [
      { name: 'Tomatoes', quantity: 500, unit: 'g' },
      { name: 'Onion', quantity: 1, unit: 'Unit' },
    ],
    instructions: ['Chop tomatoes and onion', 'Simmer for 20 minutes', 'Blend until smooth'],
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

const mockRecipe2WithAvailability = {
  recipe: mockRecipes[1],
  ingredientAvailability: [
    { name: 'Tomatoes', required: 500, unit: 'g', available: 500, status: 'available' as const },
    { name: 'Onion', required: 1, unit: 'Unit', available: 1, status: 'available' as const },
  ],
  missingCount: 0,
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
    }
  });

  // GET /recipes/tags
  await page.route('**/recipes/tags', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tags: ['italian', 'quick', 'soup', 'vegetarian'] }),
    });
  });

  // GET /recipes/recipe-1
  await page.route('**/recipes/recipe-1', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockRecipeWithAvailability),
      });
    } else if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });

  // GET /recipes/recipe-2
  await page.route('**/recipes/recipe-2', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockRecipe2WithAvailability),
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

test.describe('Recipe Cooking Mode', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
    await loginAndGoToRecipes(page);
  });

  test('"Cook" button appears in recipe detail action bar', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    await expect(page.getByTestId('cook-button')).toBeVisible();
    await expect(page.getByTestId('cook-button')).toHaveText('🍳 Cook');
  });

  test('clicking "Cook" starts a session and navigates to cooking page', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    await page.getByTestId('cook-button').click();

    // Should be on the cooking page now — check for cooking mode elements
    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible();
  });

  test('cooking page shows split layout with steps, ingredients, and drag handle', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    // Should show steps panel
    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Should show ingredient availability via the Ingredients section
    await expect(page.getByRole('region', { name: 'Ingredients' })).toBeVisible();

    // Drag handle should be visible
    await expect(page.getByRole('separator', { name: 'Drag to resize panels' })).toBeVisible();
  });

  test('step navigation: Next advances, Previous goes back', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    // Initial state: step 1 of 5
    await expect(page.getByText('Step 1 of 5')).toBeVisible({ timeout: 5000 });

    // Click Next
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect(page.getByText('Step 2 of 5')).toBeVisible();

    // Click Previous
    await page.getByRole('button', { name: 'Previous step' }).click();
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
  });

  test('Previous disabled at first step, Next disabled at last step', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Previous should be disabled at step 1
    await expect(page.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next step' })).toBeEnabled();

    // Navigate to last step
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Next step' }).click();
    }
    await expect(page.getByText('Step 5 of 5')).toBeVisible();

    // Next should be disabled at last step
    await expect(page.getByRole('button', { name: 'Next step' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Previous step' })).toBeEnabled();
  });

  test('tapping a step directly sets it as current', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Tap step 3 directly
    await page.getByTestId('cooking-step-2').click();

    // Step counter should reflect step 3
    await expect(page.getByText('Step 3 of 5')).toBeVisible();

    // Step 3 should have current indicator (amber background via aria-current)
    await expect(page.getByTestId('cooking-step-2')).toHaveAttribute('aria-current', 'step');
  });

  test('progress bar updates with step position', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Progress bar should exist
    const progressBar = page.getByRole('progressbar', { name: 'Recipe progress' });
    await expect(progressBar).toBeVisible();

    // Initial: 1/5 = 20%
    await expect(progressBar).toHaveAttribute('aria-valuenow', '1');

    // Advance to step 3
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect(progressBar).toHaveAttribute('aria-valuenow', '3');
  });

  test('completed steps show checkmark indicator', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Advance to step 3
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByRole('button', { name: 'Next step' }).click();

    // Steps 0 and 1 should have aria-label indicating completed
    await expect(page.getByTestId('cooking-step-0')).toHaveAttribute('aria-label', /completed/);
    await expect(page.getByTestId('cooking-step-1')).toHaveAttribute('aria-label', /completed/);
  });

  test('"Finish Cooking" with all steps done returns to recipe list', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Navigate to last step
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Next step' }).click();
    }
    await expect(page.getByText('Step 5 of 5')).toBeVisible();

    // Click Finish — should complete without confirmation (last step reached)
    await page.getByTestId('finish-cooking-button').click();

    // Should be back on recipe list
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible({ timeout: 5000 });
  });

  test('"Finish Cooking" with unfinished steps shows confirmation dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Don't advance — click Finish at step 1
    await page.getByTestId('finish-cooking-button').click();

    // Confirmation dialog should appear
    await expect(page.getByTestId('confirm-dialog-backdrop')).toBeVisible({ timeout: 3000 });
  });

  test('"Keep Cooking" dismisses confirmation dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Click Finish → confirm dialog appears
    await page.getByTestId('finish-cooking-button').click();
    await expect(page.getByTestId('confirm-dialog-backdrop')).toBeVisible({ timeout: 3000 });

    // Click "Keep Cooking"
    await page.getByTestId('confirm-dialog-cancel').click();

    // Dialog should disappear, still on cooking page
    await expect(page.getByTestId('confirm-dialog-backdrop')).toHaveCount(0);
    await expect(page.getByTestId('cooking-step-0')).toBeVisible();
  });

  test('"Finish Anyway" ends session and returns to recipes', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Click Finish → confirm dialog
    await page.getByTestId('finish-cooking-button').click();
    await expect(page.getByTestId('confirm-dialog-backdrop')).toBeVisible({ timeout: 3000 });

    // Click "Finish Anyway"
    await page.getByTestId('confirm-dialog-confirm').click();

    // Should be back on recipe list
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible({ timeout: 5000 });
  });

  test('navigating away from cooking page shows "Return to Cooking" banner', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Navigate to Inventory
    await page.getByRole('button', { name: 'Inventory' }).click();
    await page.waitForSelector('h2:has-text("Inventory")', { timeout: 5000 });

    // Return to Cooking banner should be visible
    await expect(page.getByTestId('return-to-cooking-banner')).toBeVisible();
    await expect(page.getByText('Pasta Carbonara')).toBeVisible(); // recipe name in banner
  });

  test('"Return to Cooking" banner navigates back to cooking page', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Navigate away
    await page.getByRole('button', { name: 'Inventory' }).click();
    await page.waitForSelector('h2:has-text("Inventory")', { timeout: 5000 });
    await expect(page.getByTestId('return-to-cooking-banner')).toBeVisible();

    // Click Return to Cooking
    await page.getByRole('button', { name: 'Return to cooking' }).click();

    // Should be back on cooking page
    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });
  });

  test('step progress is preserved after navigating away and returning', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Advance to step 3
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect(page.getByText('Step 3 of 5')).toBeVisible();

    // Navigate away
    await page.getByRole('button', { name: 'Inventory' }).click();
    await page.waitForSelector('h2:has-text("Inventory")', { timeout: 5000 });

    // Return to cooking
    await page.getByRole('button', { name: 'Return to cooking' }).click();
    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Should still be at step 3
    await expect(page.getByText('Step 3 of 5')).toBeVisible();
  });

  test('"Resume Cooking" button appears on the same recipe when session is active', async ({ page }) => {
    // Start cooking
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();
    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Navigate back
    await page.getByRole('button', { name: 'Leave cooking mode' }).click();

    // Should be on recipe list
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible({ timeout: 5000 });

    // Re-open the same recipe
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });

    // Cook button should say "Resume Cooking"
    await expect(page.getByTestId('cook-button')).toHaveText('🍳 Resume Cooking');
  });

  test('"Cook" button shows correct state for different recipe when session active', async ({ page }) => {
    // Start cooking Pasta Carbonara
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();
    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Navigate back to recipe list
    await page.getByRole('button', { name: 'Leave cooking mode' }).click();
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible({ timeout: 5000 });

    // Open a different recipe
    await page.getByRole('button', { name: 'View Tomato Soup' }).click();
    await expect(page.getByRole('heading', { name: 'Tomato Soup' })).toBeVisible({ timeout: 5000 });

    // Cook button should be disabled
    await expect(page.getByTestId('cook-button')).toBeDisabled();
  });

  test('portions scaler works in cooking mode', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // The portions controls are grouped with aria-label
    const portionsGroup = page.getByLabel('Portions');
    // Initial portions should be 4 (from sample data)
    await expect(portionsGroup.getByText('4', { exact: true })).toBeVisible();

    // Click + to increase portions
    await page.getByRole('button', { name: 'Increase portions' }).click();
    await expect(portionsGroup.getByText('5', { exact: true })).toBeVisible();

    // Click – to decrease
    await page.getByRole('button', { name: 'Decrease portions' }).click();
    await expect(portionsGroup.getByText('4', { exact: true })).toBeVisible();
  });

  test('back button in cooking mode returns to recipe list', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Click back/leave
    await page.getByRole('button', { name: 'Leave cooking mode' }).click();

    // Should be back on recipe list (session still active)
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible({ timeout: 5000 });

    // Return to Cooking banner should still be visible
    await expect(page.getByTestId('return-to-cooking-banner')).toBeVisible();
  });

  test('recipe list shows cooking indicator for the actively cooking recipe', async ({ page }) => {
    // Start cooking
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();
    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // Navigate back to recipe list
    await page.getByRole('button', { name: 'Leave cooking mode' }).click();
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible({ timeout: 5000 });

    // The actively cooking recipe should show a cooking indicator
    const pastaRow = page.getByRole('button', { name: 'View Pasta Carbonara' });
    await expect(pastaRow).toBeVisible();
    await expect(pastaRow.getByLabel('Currently cooking')).toBeVisible();
  });

  test('cooking mode banner is not shown on the cooking page itself', async ({ page }) => {
    await page.getByRole('button', { name: 'View Pasta Carbonara' }).click();
    await expect(page.getByRole('heading', { name: 'Pasta Carbonara' })).toBeVisible({ timeout: 5000 });
    await page.getByTestId('cook-button').click();

    await expect(page.getByTestId('cooking-step-0')).toBeVisible({ timeout: 5000 });

    // The Return to Cooking banner should NOT be visible while on the cooking page
    await expect(page.getByTestId('return-to-cooking-banner')).toHaveCount(0);
  });
});
