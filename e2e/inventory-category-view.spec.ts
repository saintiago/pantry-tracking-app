import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Inventory Category View
 *
 * Tests the category summary view and drill-down navigation in the InventoryList component.
 * Requires VITE_MOCK_AUTH=true (set in playwright.config.ts webServer env).
 * Backend API calls are mocked via Playwright route interception.
 */

// Mock inventory items spanning 2 categories
const mockInventoryItems = [
  {
    itemId: 'item-dairy-1',
    name: 'Milk',
    category: 'Dairy',
    expirationDate: '2025-12-01',
    location: 'loc-1',
    quantity: 2,
    unit: 'l',
    isLowStock: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    itemId: 'item-dairy-2',
    name: 'Cheese',
    category: 'Dairy',
    expirationDate: '2025-11-01',
    location: 'loc-2',
    quantity: 3,
    unit: 'piece',
    isLowStock: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    itemId: 'item-snacks-1',
    name: 'Chips',
    category: 'Snacks',
    expirationDate: '2025-10-01',
    location: 'loc-1',
    quantity: 5,
    unit: 'piece',
    isLowStock: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
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
}

async function login(page: Page) {
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('h2:has-text("Inventory")', { timeout: 10000 });
}

/**
 * Grouping fixture: a Dairy category containing three mergeable "Milk" children
 * (identical name/category/unit `l`, distinct itemId/expirationDate) with one
 * low-stock child, so a real multi-child Grouped_Row is produced. The grouping
 * key for these is `milk|dairy|l` (normalizeGroupName('Milk') = "milk",
 * trimmed-lower category = "dairy", resolveUnit('l') = "l"). A separate Snacks
 * category is kept so the category-summary view still has multiple cards.
 */
const groupedMockInventoryItems = [
  {
    itemId: 'milk-1',
    name: 'Milk',
    category: 'Dairy',
    expirationDate: '2025-11-15',
    location: 'loc-2',
    quantity: 2,
    unit: 'l',
    isLowStock: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    itemId: 'milk-2',
    name: 'Milk',
    category: 'Dairy',
    expirationDate: '2025-12-01',
    location: 'loc-2',
    quantity: 1,
    unit: 'l',
    isLowStock: true,
    threshold: 2,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
  {
    itemId: 'milk-3',
    name: 'Milk',
    category: 'Dairy',
    expirationDate: '2026-01-01',
    location: 'loc-1',
    quantity: 3,
    unit: 'l',
    isLowStock: false,
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
  },
  {
    itemId: 'snack-1',
    name: 'Chips',
    category: 'Snacks',
    expirationDate: '2025-10-01',
    location: 'loc-1',
    quantity: 5,
    unit: 'piece',
    isLowStock: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

// Canonical grouping key + scoped testid for the Milk group above.
const MILK_GROUP_KEY = 'milk|dairy|l';

/**
 * Overrides the GET /inventory mock (registered last, so it takes precedence
 * over the beforeEach handler) with the grouping fixture, then reloads and
 * re-authenticates so the fresh fetch picks up the new data. Used only by the
 * grouping tests so the existing category-summary assertions stay valid.
 */
async function loadGroupedInventory(page: Page) {
  await page.route('**/inventory', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: groupedMockInventoryItems }),
      });
    } else {
      await route.fallback();
    }
  });
  // The item detail view's name autocomplete issues a search request; mock it
  // so navigating into a child item doesn't hit the dev server.
  await page.route('**/inventory/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ field: 'name', query: '', resultType: 'items', items: [], count: 0 }),
    });
  });

  await page.reload();
  await login(page);
}

// Drill into the Dairy category and return the scoped grouped-row locator.
async function openDairyMilkGroup(page: Page) {
  await page.getByTestId('category-card-Dairy').click();
  const groupedRow = page.getByTestId(`grouped-row-${MILK_GROUP_KEY}`);
  await expect(groupedRow).toBeVisible({ timeout: 5000 });
  return groupedRow;
}

test.describe('Inventory Category View', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
    await page.goto('/');
    await login(page);
  });

  test('inventory page shows category cards instead of individual items on load', async ({ page }) => {
    // Category cards should be visible
    await expect(page.getByTestId('category-card-Dairy')).toBeVisible();
    await expect(page.getByTestId('category-card-Snacks')).toBeVisible();

    // Individual item names should NOT be visible
    await expect(page.getByText('Milk')).not.toBeVisible();
    await expect(page.getByText('Cheese')).not.toBeVisible();
    await expect(page.getByText('Chips')).not.toBeVisible();
  });

  test('category card displays correct item count and total quantity', async ({ page }) => {
    // Dairy: 2 items, mixed units (Liter + Unit)
    const dairyCard = page.getByTestId('category-card-Dairy');
    await expect(dairyCard).toContainText('2 items');
    await expect(dairyCard).toContainText('mixed units');

    // Snacks: 1 item, quantity 5 pieces
    const snacksCard = page.getByTestId('category-card-Snacks');
    await expect(snacksCard).toContainText('1 items');
    await expect(snacksCard).toContainText('5 pieces');
  });

  test('clicking a category card navigates to item list showing only items from that category', async ({ page }) => {
    await page.getByTestId('category-card-Dairy').click();

    // Dairy items visible
    await expect(page.getByText('Milk')).toBeVisible();
    await expect(page.getByText('Cheese')).toBeVisible();

    // Snacks item NOT visible
    await expect(page.getByText('Chips')).not.toBeVisible();
  });

  test('back button is visible in item list view and clicking it returns to category summary', async ({ page }) => {
    // No back button in category-summary view
    await expect(page.getByLabel('Back to categories')).not.toBeVisible();

    // Drill into Dairy
    await page.getByTestId('category-card-Dairy').click();

    // Back button now visible
    const backBtn = page.getByLabel('Back to categories');
    await expect(backBtn).toBeVisible();

    // Click back
    await backBtn.click();

    // Category cards visible again
    await expect(page.getByTestId('category-card-Dairy')).toBeVisible();
    await expect(page.getByTestId('category-card-Snacks')).toBeVisible();
  });

  test('category cards are no longer visible after drilling into a category', async ({ page }) => {
    await page.getByTestId('category-card-Dairy').click();

    // Category cards should be gone
    await expect(page.getByTestId('category-card-Dairy')).not.toBeVisible();
    await expect(page.getByTestId('category-card-Snacks')).not.toBeVisible();
  });

  test('text filter applied in category view carries over and filters items in item list view', async ({ page }) => {
    // Type a filter that matches only "Milk" within Dairy
    await page.getByLabel('Filter by product name').fill('Mil');

    // Dairy card should still be visible (Milk matches)
    await expect(page.getByTestId('category-card-Dairy')).toBeVisible();

    // Drill into Dairy
    await page.getByTestId('category-card-Dairy').click();

    // Only Milk visible, Cheese filtered out
    await expect(page.getByText('Milk')).toBeVisible();
    await expect(page.getByText('Cheese')).not.toBeVisible();
  });

  /* ── Grouping in the item-list view ──────────────────────────── */

  test('grouped row renders total quantity, child count and a low-stock badge, collapsed by default', async ({ page }) => {
    await loadGroupedInventory(page);
    const groupedRow = await openDairyMilkGroup(page);

    // Summary: 3 children, total 6 liters (2 + 1 + 3).
    await expect(groupedRow).toContainText('3 items');
    await expect(groupedRow).toContainText('6 liters');

    // Low-stock badge present because milk-2 is low stock.
    await expect(groupedRow.getByText('Low Stock', { exact: true })).toBeVisible();

    // Collapsed by default: aria-expanded false and no child cards rendered.
    await expect(groupedRow).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('item-card-milk-1')).not.toBeVisible();
    await expect(page.getByTestId('item-card-milk-2')).not.toBeVisible();
    await expect(page.getByTestId('item-card-milk-3')).not.toBeVisible();
  });

  test('clicking the grouped row expands to reveal child items, then collapses again', async ({ page }) => {
    await loadGroupedInventory(page);
    const groupedRow = await openDairyMilkGroup(page);

    // Expand
    await groupedRow.click();
    await expect(groupedRow).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('item-card-milk-1')).toBeVisible();
    await expect(page.getByTestId('item-card-milk-2')).toBeVisible();
    await expect(page.getByTestId('item-card-milk-3')).toBeVisible();

    // Collapse
    await groupedRow.click();
    await expect(groupedRow).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('item-card-milk-1')).not.toBeVisible();
    await expect(page.getByTestId('item-card-milk-3')).not.toBeVisible();
  });

  test('Enter key toggles the grouped row identically to pointer activation', async ({ page }) => {
    await loadGroupedInventory(page);
    const groupedRow = await openDairyMilkGroup(page);

    await groupedRow.focus();

    // Enter expands
    await page.keyboard.press('Enter');
    await expect(groupedRow).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('item-card-milk-2')).toBeVisible();

    // Enter collapses
    await page.keyboard.press('Enter');
    await expect(groupedRow).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('item-card-milk-2')).not.toBeVisible();
  });

  test('Space key toggles the grouped row identically to pointer activation', async ({ page }) => {
    await loadGroupedInventory(page);
    const groupedRow = await openDairyMilkGroup(page);

    await groupedRow.focus();

    // Space expands
    await page.keyboard.press(' ');
    await expect(groupedRow).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('item-card-milk-2')).toBeVisible();

    // Space collapses
    await page.keyboard.press(' ');
    await expect(groupedRow).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('item-card-milk-2')).not.toBeVisible();
  });

  test('activating a child item opens the item detail view', async ({ page }) => {
    await loadGroupedInventory(page);
    const groupedRow = await openDairyMilkGroup(page);

    // Expand, then activate the low-stock child.
    await groupedRow.click();
    const childCard = page.getByTestId('item-card-milk-2');
    await expect(childCard).toBeVisible();
    await childCard.click();

    // Item detail view opens (heading shows the item name).
    await expect(page.getByRole('heading', { name: 'Milk' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel('Product Name')).toHaveValue('Milk');
  });
});
