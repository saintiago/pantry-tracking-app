import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: AddItemPage
 *
 * Tests navigation to/from AddItemPage and form submission behaviour.
 * Requires VITE_MOCK_AUTH=true (set in playwright.config.ts webServer env).
 * Backend API calls are mocked via Playwright route interception.
 */

const mockLocations = [
  { locationId: 'loc-1', name: 'Pantry', userId: 'test-user' },
  { locationId: 'loc-2', name: 'Fridge', userId: 'test-user' },
];

const mockInventoryItem = {
  itemId: 'item-scan-1',
  barcode: '012345678901',
  name: 'Scanned Milk',
  category: 'Dairy',
  brand: 'Organic Valley',
  unit: 'Liter',
  location: 'loc-1',
  quantity: 1,
  expirationDate: '2026-12-31',
  isLowStock: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  syncVersion: 1,
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
      body: JSON.stringify({ locations: mockLocations }),
    });
  });

  await page.route('**/inventory', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
    } else if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ item: mockInventoryItem }),
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

  await page.route('**/inventory/barcode-lookup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ found: false }),
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

test.describe('AddItemPage', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
    await loginAndGoToInventory(page);
  });

  test('navigates from InventoryPage to AddItemPage via Manual Entry', async ({ page }) => {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Manual Entry' }).click();

    // Should show the Add Item page header (not a dialog)
    await expect(page.getByRole('heading', { name: 'Add Item' })).toBeVisible({ timeout: 5000 });
    // Should NOT be a dialog
    await expect(page.getByRole('dialog')).not.toBeVisible();
    // Product Name should be focused
    await expect(page.getByLabel('Product Name')).toBeFocused({ timeout: 2000 });
  });

  test('storage locations are populated from locations prop', async ({ page }) => {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Manual Entry' }).click();

    await expect(page.getByRole('heading', { name: 'Add Item' })).toBeVisible({ timeout: 5000 });

    const locationSelect = page.getByLabel('Storage Location');
    await expect(locationSelect.locator('option', { hasText: 'Pantry' })).toBeAttached();
    await expect(locationSelect.locator('option', { hasText: 'Fridge' })).toBeAttached();
  });

  test('shows validation errors on invalid submit', async ({ page }) => {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
    await expect(page.getByRole('heading', { name: 'Add Item' })).toBeVisible({ timeout: 5000 });

    // Click submit without filling anything
    await page.getByRole('button', { name: 'Add Item' }).click();

    await expect(page.getByText('Product name is required.')).toBeVisible();
    await expect(page.getByText('Category is required.')).toBeVisible();
    await expect(page.getByText('Expiration date is required.')).toBeVisible();
    await expect(page.getByText('Storage location is required.')).toBeVisible();
    await expect(page.getByText('Quantity is required.')).toBeVisible();
    await expect(page.getByText('Unit is required.')).toBeVisible();
  });

  test('successful form submission shows success message then returns to InventoryPage', async ({ page }) => {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
    await expect(page.getByRole('heading', { name: 'Add Item' })).toBeVisible({ timeout: 5000 });

    await page.getByLabel('Product Name').fill('Test Milk');
    await page.getByLabel('Category').fill('Dairy');
    await page.getByLabel('Expiration Date').fill('2026-12-31');
    await page.getByLabel('Storage Location').selectOption('loc-1');
    await page.getByLabel('Quantity').fill('2');
    await page.getByLabel('Unit').selectOption('Liter');

    await page.getByRole('button', { name: 'Add Item' }).click();

    await expect(page.getByText('Item added successfully!')).toBeVisible({ timeout: 3000 });
    // After success delay, should navigate back to inventory
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible({ timeout: 5000 });
  });

  test('back button returns to InventoryPage without submitting', async ({ page }) => {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
    await expect(page.getByRole('heading', { name: 'Add Item' })).toBeVisible({ timeout: 5000 });

    await page.getByLabel('Product Name').fill('Should Not Submit');

    await page.getByRole('button', { name: 'Go back' }).click();

    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible({ timeout: 3000 });
  });

  test('Cancel button in action bar returns to InventoryPage without submitting', async ({ page }) => {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
    await expect(page.getByRole('heading', { name: 'Add Item' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible({ timeout: 3000 });
  });

  test('bottom nav remains visible and functional while on AddItemPage', async ({ page }) => {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
    await expect(page.getByRole('heading', { name: 'Add Item' })).toBeVisible({ timeout: 5000 });

    // Bottom nav should still be visible
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).toBeVisible();

    // Clicking a nav item should navigate away
    await page.getByRole('button', { name: 'Recipes' }).click();
    await expect(page.getByRole('heading', { name: 'Add Item' })).not.toBeVisible();
  });

  test('Submit and Cancel buttons are rendered inside the action bar', async ({ page }) => {
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
    await expect(page.getByRole('heading', { name: 'Add Item' })).toBeVisible({ timeout: 5000 });

    const actionBar = page.getByTestId('action-bar');
    await expect(actionBar).toBeVisible();
    await expect(actionBar.getByRole('button', { name: 'Add Item' })).toBeVisible();
    await expect(actionBar.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });
});
