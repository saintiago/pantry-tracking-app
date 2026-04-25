import { test, expect, Page, Locator } from '@playwright/test';

/**
 * E2E Test Suite: Barcode Autofill Feature
 *
 * Tests the autocomplete and autofill functionality for the AddItemModal.
 * Requires VITE_MOCK_AUTH=true (set in playwright.config.ts webServer env)
 * so the Cognito SDK is replaced by e2e/mocks/cognitoClient.ts.
 * Backend API calls are mocked via Playwright route interception.
 */

// Helper: returns the Add Item dialog locator
function modal(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Add Item' });
}

// Helper: wait for dropdown option and click it
async function selectOption(page: Page, text: string) {
  const option = page.locator(`[role="option"]:has-text("${text}")`);
  await expect(option).toBeVisible({ timeout: 3000 });
  await option.click();
}

// Helper function to open the Add Item modal
async function openAddItemModal(page: Page) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
  await expect(modal(page).getByLabel('Barcode')).toBeVisible({ timeout: 5000 });
}

// Mock inventory data
const mockInventoryItems = [
  {
    itemId: 'item-1',
    barcode: '012345678901',
    name: 'Organic Milk',
    category: 'Dairy',
    brand: 'Organic Valley',
    unit: 'Liter',
    whereToBuy: 'Whole Foods',
    onlineStoreLink: 'https://example.com/milk',
  },
  {
    itemId: 'item-2',
    barcode: '012345678902',
    name: 'Almond Milk',
    category: 'Dairy',
    brand: 'Silk',
    unit: 'Liter',
    whereToBuy: 'Trader Joes',
    onlineStoreLink: 'https://example.com/almond-milk',
  },
  {
    itemId: 'item-3',
    name: 'Organic Eggs',
    category: 'Dairy',
    brand: 'Organic Valley',
    unit: 'Unit',
  },
];

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
      body: JSON.stringify({
        locations: [
          { locationId: 'loc-1', name: 'Pantry', userId: 'test-user' },
          { locationId: 'loc-2', name: 'Fridge', userId: 'test-user' },
        ],
      }),
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
    const url = new URL(route.request().url());
    const field = url.searchParams.get('field');
    const query = url.searchParams.get('query')?.toLowerCase() || '';
    let response;

    switch (field) {
      case 'barcode': {
        const matches = mockInventoryItems.filter((i) => i.barcode?.includes(query));
        response = { field, query, resultType: 'items', items: matches.slice(0, 10), count: matches.length };
        break;
      }
      case 'name': {
        const matches = mockInventoryItems.filter((i) => i.name.toLowerCase().includes(query));
        response = { field, query, resultType: 'items', items: matches.slice(0, 10), count: matches.length };
        break;
      }
      case 'category': {
        const vals = [...new Set(mockInventoryItems.map((i) => i.category).filter((c) => c.toLowerCase().includes(query)))];
        response = { field, query, resultType: 'values', values: vals.slice(0, 10), count: vals.length };
        break;
      }
      case 'brand': {
        const vals = [...new Set(mockInventoryItems.map((i) => i.brand).filter((b): b is string => !!b && b.toLowerCase().includes(query)))];
        response = { field, query, resultType: 'values', values: vals.slice(0, 10), count: vals.length };
        break;
      }
      case 'whereToBuy': {
        const vals = [...new Set(mockInventoryItems.map((i) => i.whereToBuy).filter((s): s is string => !!s && s.toLowerCase().includes(query)))];
        response = { field, query, resultType: 'values', values: vals.slice(0, 10), count: vals.length };
        break;
      }
      case 'onlineStoreLink': {
        const vals = [...new Set(mockInventoryItems.map((i) => i.onlineStoreLink).filter((l): l is string => !!l && l.toLowerCase().includes(query)))];
        response = { field, query, resultType: 'values', values: vals.slice(0, 10), count: vals.length };
        break;
      }
      default:
        response = { field, query, resultType: 'values', values: [], count: 0 };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });

  await page.route('**/inventory/barcode-lookup', async (route) => {
    const body = await route.request().postDataJSON();
    if (body.barcode === '987654321098') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          found: true,
          product: { name: 'External Product', category: 'Snacks', brand: 'External Brand' },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ found: false }),
      });
    }
  });
}

test.describe('Barcode Autofill Feature', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
    await page.goto('/');

    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');

    await page.waitForSelector('h2:has-text("Inventory")', { timeout: 10000 });
  });

  test('should show autocomplete dropdown when typing barcode', async ({ page }) => {
    await openAddItemModal(page);
    const dlg = modal(page);

    await dlg.getByLabel('Barcode').fill('012');
    await page.waitForTimeout(400);

    const dropdown = dlg.locator('[role="listbox"]');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator('text=Organic Milk')).toBeVisible();
    await expect(dropdown.locator('text=Almond Milk')).toBeVisible();
  });

  test('should autofill all fields when selecting from barcode dropdown', async ({ page }) => {
    await openAddItemModal(page);
    const dlg = modal(page);

    await dlg.getByLabel('Barcode').fill('012345678901');
    await page.waitForTimeout(400);
    await selectOption(page, 'Organic Milk');

    await expect(dlg.getByLabel('Product Name')).toHaveValue('Organic Milk');
    await expect(dlg.getByLabel('Category')).toHaveValue('Dairy');
    await expect(dlg.getByLabel('Brand')).toHaveValue('Organic Valley');
    await expect(dlg.getByLabel('Unit')).toHaveValue('Liter');
    await expect(dlg.getByLabel('Where to Buy')).toHaveValue('Whole Foods');
    await expect(dlg.getByLabel('Online Store Link')).toHaveValue('https://example.com/milk');
  });

  test('should show prefilled field styling', async ({ page }) => {
    await openAddItemModal(page);
    const dlg = modal(page);

    await dlg.getByLabel('Barcode').fill('012345678901');
    await page.waitForTimeout(400);
    await selectOption(page, 'Organic Milk');

    const nameInput = dlg.getByLabel('Product Name');
    const bgColor = await nameInput.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });

  test('should remove prefilled styling when user edits field', async ({ page }) => {
    await openAddItemModal(page);
    const dlg = modal(page);

    await dlg.getByLabel('Barcode').fill('012345678901');
    await page.waitForTimeout(400);
    await selectOption(page, 'Organic Milk');

    const nameInput = dlg.getByLabel('Product Name');
    await nameInput.click();
    await nameInput.press('End');
    await nameInput.type(' - Edited');

    const bgColor = await nameInput.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(bgColor).toBe('rgb(255, 255, 255)');
  });

  test('should show autocomplete for category field', async ({ page }) => {
    await openAddItemModal(page);
    const dlg = modal(page);

    await dlg.getByLabel('Category').fill('D');
    await page.waitForTimeout(400);

    const dropdown = dlg.locator('[role="listbox"]');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator('text=Dairy')).toBeVisible();
  });

  test('should autofill only category when selecting from category dropdown', async ({ page }) => {
    await openAddItemModal(page);
    const dlg = modal(page);

    await dlg.getByLabel('Category').fill('Dai');
    await page.waitForTimeout(400);
    await selectOption(page, 'Dairy');

    await expect(dlg.getByLabel('Category')).toHaveValue('Dairy');
    await expect(dlg.getByLabel('Product Name')).toHaveValue('');
    await expect(dlg.getByLabel('Brand')).toHaveValue('');
  });

  test('should trigger external barcode lookup for 8+ digit barcode with no local match', async ({ page }) => {
    await openAddItemModal(page);
    const dlg = modal(page);

    await dlg.getByLabel('Barcode').fill('987654321098');
    await page.waitForTimeout(400);

    await expect(dlg.getByLabel('Product Name')).toHaveValue('External Product', { timeout: 5000 });
    await expect(dlg.getByLabel('Category')).toHaveValue('Snacks');
    await expect(dlg.getByLabel('Brand')).toHaveValue('External Brand');
  });

  test('should support keyboard navigation in dropdown', async ({ page }) => {
    await openAddItemModal(page);
    const dlg = modal(page);

    const barcodeInput = dlg.getByRole('textbox', { name: 'Barcode' });
    await barcodeInput.fill('012');
    await page.waitForTimeout(400);

    await barcodeInput.press('ArrowDown');
    await barcodeInput.press('Enter');

    await expect(dlg.getByLabel('Product Name')).toHaveValue('Organic Milk');
  });

  test('should close dropdown on Escape key', async ({ page }) => {
    await openAddItemModal(page);
    const dlg = modal(page);

    const barcodeInput = dlg.getByRole('textbox', { name: 'Barcode' });
    await barcodeInput.fill('012');
    await page.waitForTimeout(400);

    const dropdown = dlg.locator('[role="listbox"]');
    await expect(dropdown).toBeVisible();

    await barcodeInput.press('Escape');
    await expect(dropdown).not.toBeVisible();
  });

  test('should not overwrite user-edited fields', async ({ page }) => {
    await openAddItemModal(page);
    const dlg = modal(page);

    const nameInput = dlg.getByLabel('Product Name');
    await nameInput.fill('My Custom Name');

    await dlg.getByLabel('Barcode').fill('012345678901');
    await page.waitForTimeout(400);
    await selectOption(page, 'Organic Milk');

    await expect(nameInput).toHaveValue('My Custom Name');
    await expect(dlg.getByLabel('Category')).toHaveValue('Dairy');
  });
});
