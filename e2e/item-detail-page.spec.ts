import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: ItemDetailPage
 *
 * Tests navigation to/from ItemDetailPage and save/cancel behaviour.
 * Requires VITE_MOCK_AUTH=true (set in playwright.config.ts webServer env).
 * Backend API calls are mocked via Playwright route interception.
 */

const mockLocations = [
  { locationId: 'loc-1', name: 'Pantry', userId: 'test-user' },
  { locationId: 'loc-2', name: 'Fridge', userId: 'test-user' },
];

const mockItem = {
  itemId: 'item-1',
  PK: 'USER#test-user',
  SK: 'ITEM#item-1',
  entityType: 'InventoryItem' as const,
  userId: 'test-user',
  name: 'Organic Milk',
  category: 'Dairy',
  brand: 'Organic Valley',
  barcode: '012345678901',
  unit: 'Liter',
  location: 'loc-1',
  quantity: 2,
  expirationDate: '2026-12-31',
  isLowStock: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  syncVersion: 1,
};

const mockLowStockItem = {
  ...mockItem,
  itemId: 'item-2',
  SK: 'ITEM#item-2',
  name: 'Almost Gone Eggs',
  quantity: 1,
  threshold: 2,
  isLowStock: true,
};

async function setupMockAPI(page: Page, items = [mockItem]) {
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
      body: JSON.stringify({ locations: mockLocations }),
    });
  });

  await page.route('**/inventory', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items }),
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
}

async function loginAndGoToInventory(page: Page) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('h2:has-text("Inventory")', { timeout: 10000 });
}

test.describe('ItemDetailPage', () => {
  test('tapping an inventory item navigates to ItemDetailPage with fields pre-populated', async ({ page }) => {
    await setupMockAPI(page);
    await loginAndGoToInventory(page);

    await page.getByText('Organic Milk').first().click();

    await expect(page.getByRole('heading', { name: 'Organic Milk' })).toBeVisible({ timeout: 5000 });
    // Should NOT be a dialog/overlay
    await expect(page.getByTestId('item-detail-overlay')).not.toBeVisible();

    await expect(page.getByLabel('Product Name')).toHaveValue('Organic Milk');
    await expect(page.getByLabel('Category')).toHaveValue('Dairy');
    await expect(page.getByLabel('Brand')).toHaveValue('Organic Valley');
    await expect(page.getByLabel('Quantity')).toHaveValue('2');
    await expect(page.getByLabel('Unit')).toHaveValue('Liter');
    await expect(page.getByLabel('Expiration Date')).toHaveValue('2026-12-31');
    await expect(page.getByLabel('Storage Location')).toHaveValue('loc-1');
  });

  test('shows low-stock badge when item.isLowStock is true', async ({ page }) => {
    await setupMockAPI(page, [mockLowStockItem]);
    await loginAndGoToInventory(page);

    await page.getByText('Almost Gone Eggs').first().click();
    await expect(page.getByRole('heading', { name: 'Almost Gone Eggs' })).toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/low stock/i)).toBeVisible();
  });

  test('edit fields and save updates the inventory list', async ({ page }) => {
    const updatedItem = { ...mockItem, name: 'Updated Milk', quantity: 5 };

    await setupMockAPI(page);
    // Mock the PUT endpoint
    await page.route('**/inventory/item-1', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ item: updatedItem }),
        });
      }
    });
    await loginAndGoToInventory(page);

    await page.getByText('Organic Milk').first().click();
    await expect(page.getByRole('heading', { name: 'Organic Milk' })).toBeVisible({ timeout: 5000 });

    await page.getByLabel('Product Name').fill('Updated Milk');
    await page.getByLabel('Quantity').fill('5');

    await page.getByTestId('save-button').click();

    // Should navigate back to inventory
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible({ timeout: 5000 });
  });

  test('save error is shown in banner without navigating away', async ({ page }) => {
    await setupMockAPI(page);
    await page.route('**/inventory/item-1', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'InternalError', message: 'Server error' }),
        });
      }
    });
    await loginAndGoToInventory(page);

    await page.getByText('Organic Milk').first().click();
    await expect(page.getByRole('heading', { name: 'Organic Milk' })).toBeVisible({ timeout: 5000 });

    await page.getByTestId('save-button').click();

    // Error banner should appear
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 3000 });
    // Should still be on the detail page
    await expect(page.getByRole('heading', { name: 'Organic Milk' })).toBeVisible();
  });

  test('Cancel returns to InventoryPage without saving changes', async ({ page }) => {
    await setupMockAPI(page);
    await loginAndGoToInventory(page);

    await page.getByText('Organic Milk').first().click();
    await expect(page.getByRole('heading', { name: 'Organic Milk' })).toBeVisible({ timeout: 5000 });

    await page.getByLabel('Product Name').fill('Should Not Save');

    await page.getByTestId('cancel-button').click();

    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible({ timeout: 3000 });
    // Original name should still be in the list
    await expect(page.getByText('Organic Milk')).toBeVisible();
  });

  test('back button returns to InventoryPage without saving', async ({ page }) => {
    await setupMockAPI(page);
    await loginAndGoToInventory(page);

    await page.getByText('Organic Milk').first().click();
    await expect(page.getByRole('heading', { name: 'Organic Milk' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Go back' }).click();

    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible({ timeout: 3000 });
  });

  test('bottom nav remains visible and functional while on ItemDetailPage', async ({ page }) => {
    await setupMockAPI(page);
    await loginAndGoToInventory(page);

    await page.getByText('Organic Milk').first().click();
    await expect(page.getByRole('heading', { name: 'Organic Milk' })).toBeVisible({ timeout: 5000 });

    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).toBeVisible();

    await page.getByRole('button', { name: 'Recipes' }).click();
    await expect(page.getByRole('heading', { name: 'Organic Milk' })).not.toBeVisible();
  });

  test('Save and Cancel buttons are rendered inside the action bar', async ({ page }) => {
    await setupMockAPI(page);
    await loginAndGoToInventory(page);

    await page.getByText('Organic Milk').first().click();
    await expect(page.getByRole('heading', { name: 'Organic Milk' })).toBeVisible({ timeout: 5000 });

    const actionBar = page.getByTestId('action-bar');
    await expect(actionBar).toBeVisible();
    await expect(actionBar.getByTestId('save-button')).toBeVisible();
    await expect(actionBar.getByTestId('cancel-button')).toBeVisible();
  });
});
