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

// Existing item whose comparable fields fully match what a full Autofill will
// populate, so selecting it from the name autocomplete puts the form into the
// reactive merge state (yellow highlight + "Add to existing item" label).
const mockMergeMatch = {
  itemId: 'item-merge-1',
  name: 'Whole Milk',
  category: 'Dairy',
  brand: 'Organic Valley',
  unit: 'l',
  location: 'loc-1',
  quantity: 2,
  expirationDate: '2026-12-31',
  isLowStock: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  syncVersion: 1,
};

// Merge-state highlight palette (Req 6.1) and the existing blue prefilled palette (Req 6.2).
const MERGE_BG = 'rgb(254, 249, 195)'; // #fef9c3
const MERGE_TEXT = 'rgb(133, 77, 14)'; // #854d0e
const PREFILLED_BG = 'rgb(224, 242, 254)'; // #e0f2fe

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

/**
 * Override the search route so the name field's autocomplete returns the
 * mergeable existing item, while other fields (category/brand/etc.) return no
 * suggestions. Registered inside a test so it takes precedence over the
 * empty-results mock set up in beforeEach.
 */
async function mockSearchReturnsMatch(page: Page) {
  await page.route('**/inventory/search**', async (route) => {
    const url = new URL(route.request().url());
    const field = url.searchParams.get('field') ?? '';
    const query = url.searchParams.get('query') ?? '';
    if (field === 'name') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          field: 'name',
          query,
          resultType: 'items',
          items: [mockMergeMatch],
          count: 1,
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          field,
          query,
          resultType: field === 'barcode' ? 'items' : 'values',
          items: [],
          values: [],
          count: 0,
        }),
      });
    }
  });
}

/**
 * Override POST /inventory to model the backend's authoritative response.
 * `merged: true` returns the matched item with summed quantity and HTTP 200;
 * `merged: false` returns a freshly created item with HTTP 201.
 */
async function mockPostInventory(page: Page, merged: boolean) {
  await page.route('**/inventory', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
    } else if (route.request().method() === 'POST') {
      if (merged) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            item: { ...mockMergeMatch, quantity: 3, syncVersion: 2, updatedAt: new Date().toISOString() },
            merged: true,
            lowStockTransition: false,
          }),
        });
      } else {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            item: { ...mockMergeMatch, itemId: 'item-created-1' },
            merged: false,
          }),
        });
      }
    }
  });
}

async function gotoAddItem(page: Page) {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
  await expect(page.getByRole('heading', { name: 'Add Item' })).toBeVisible({ timeout: 5000 });
}

/**
 * Type into the Product Name field to trigger the search, then select the
 * matching suggestion via the dropdown's onMouseDown/onClick pattern (waiting
 * for the option to be visible first per the e2e dropdown convention).
 */
async function selectNameSuggestion(page: Page, text: string) {
  await page.getByLabel('Product Name').fill('Milk');
  const option = page.locator('[role="option"]', { hasText: text });
  await expect(option.first()).toBeVisible({ timeout: 3000 });
  await option.first().click();
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
    await page.getByRole('button', { name: 'Add new item' }).click();

    await expect(page.getByText('Product name is required.')).toBeVisible();
    await expect(page.getByText('Category is required.')).toBeVisible();
    await expect(page.getByText('Expiration date is required.')).toBeVisible();
    await expect(page.getByText('Storage location is required.')).toBeVisible();
    await expect(page.getByText('Quantity is required.')).toBeVisible();
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
    await page.getByLabel('Unit').selectOption('l');

    await page.getByRole('button', { name: 'Add new item' }).click();

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
    await expect(actionBar.getByRole('button', { name: 'Add new item' })).toBeVisible();
    await expect(actionBar.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test.describe('merge flow', () => {
    test('selecting a matching suggestion shows the "add to existing item" label and yellow merge highlight', async ({ page }) => {
      await mockSearchReturnsMatch(page);
      await gotoAddItem(page);

      await selectNameSuggestion(page, 'Whole Milk');

      const actionBar = page.getByTestId('action-bar');
      // Submit button reflects merge state (Req 5.1)
      await expect(actionBar.getByRole('button', { name: 'Add to existing item' })).toBeVisible();
      await expect(actionBar).toHaveAttribute('data-merge-state', 'true');

      // Prefilled fields render with the yellow merge highlight + high-contrast text (Req 6.1)
      const nameInput = page.getByLabel('Product Name');
      await expect(nameInput).toHaveCSS('background-color', MERGE_BG);
      await expect(nameInput).toHaveCSS('color', MERGE_TEXT);
      await expect(page.getByLabel('Category')).toHaveCSS('background-color', MERGE_BG);
    });

    test('editing a non-quantity prefilled field flips the label to "new" and reverts the highlight to the standard prefilled style', async ({ page }) => {
      await mockSearchReturnsMatch(page);
      await gotoAddItem(page);

      await selectNameSuggestion(page, 'Whole Milk');
      const actionBar = page.getByTestId('action-bar');
      await expect(actionBar.getByRole('button', { name: 'Add to existing item' })).toBeVisible();

      // Edit a non-quantity prefilled field so the form leaves merge state (Req 5.2, 6.2)
      await page.getByLabel('Category').fill('Beverages');

      await expect(actionBar.getByRole('button', { name: 'Add new item' })).toBeVisible();
      await expect(actionBar).toHaveAttribute('data-merge-state', 'false');

      // A still-prefilled, untouched field reverts to the blue prefilled highlight (Req 6.2)
      await expect(page.getByLabel('Product Name')).toHaveCSS('background-color', PREFILLED_BG);
    });

    test('editing only the quantity field keeps the merge label and yellow highlight', async ({ page }) => {
      await mockSearchReturnsMatch(page);
      await gotoAddItem(page);

      await selectNameSuggestion(page, 'Whole Milk');
      const actionBar = page.getByTestId('action-bar');
      await expect(actionBar.getByRole('button', { name: 'Add to existing item' })).toBeVisible();

      // Quantity is excluded from the merge-state determination (Req 5.5, 6.5)
      await page.getByLabel('Quantity').fill('5');

      await expect(actionBar.getByRole('button', { name: 'Add to existing item' })).toBeVisible();
      await expect(actionBar).toHaveAttribute('data-merge-state', 'true');
      await expect(page.getByLabel('Product Name')).toHaveCSS('background-color', MERGE_BG);
    });

    test('autofill populates an empty expiration date from the suggestion', async ({ page }) => {
      await mockSearchReturnsMatch(page);
      await gotoAddItem(page);

      await selectNameSuggestion(page, 'Whole Milk');

      // Empty expiration field is filled from the suggestion (Req 4.1)
      await expect(page.getByLabel('Expiration Date')).toHaveValue(mockMergeMatch.expirationDate);
    });

    test('autofill leaves a user-entered expiration date untouched', async ({ page }) => {
      await mockSearchReturnsMatch(page);
      await gotoAddItem(page);

      // User enters an expiration value before selecting a suggestion
      await page.getByLabel('Expiration Date').fill('2027-01-15');

      await selectNameSuggestion(page, 'Whole Milk');

      // The user-entered value is preserved (Req 4.4)
      await expect(page.getByLabel('Expiration Date')).toHaveValue('2027-01-15');
    });

    test('submitting a merge surfaces the merge success feedback then returns to InventoryPage', async ({ page }) => {
      await mockSearchReturnsMatch(page);
      await mockPostInventory(page, true);
      await gotoAddItem(page);

      await selectNameSuggestion(page, 'Whole Milk');
      const actionBar = page.getByTestId('action-bar');
      await expect(actionBar.getByRole('button', { name: 'Add to existing item' })).toBeVisible();

      await actionBar.getByRole('button', { name: 'Add to existing item' }).click();

      // Server merged:true response surfaces the merge-specific success message (Req 1.7)
      await expect(page.getByText('Quantity added to existing item!')).toBeVisible({ timeout: 3000 });
      await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible({ timeout: 5000 });
    });

    test('editing a prefilled field then submitting follows the creation path with standard success feedback', async ({ page }) => {
      await mockSearchReturnsMatch(page);
      await mockPostInventory(page, false);
      await gotoAddItem(page);

      await selectNameSuggestion(page, 'Whole Milk');
      const actionBar = page.getByTestId('action-bar');
      await expect(actionBar.getByRole('button', { name: 'Add to existing item' })).toBeVisible();

      // Diverge from the suggestion so the predicted state is a creation (Req 5.2)
      await page.getByLabel('Category').fill('Beverages');
      await expect(actionBar.getByRole('button', { name: 'Add new item' })).toBeVisible();

      await actionBar.getByRole('button', { name: 'Add new item' }).click();

      await expect(page.getByText('Item added successfully!')).toBeVisible({ timeout: 3000 });
      await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible({ timeout: 5000 });
    });
  });
});
