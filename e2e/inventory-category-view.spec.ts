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
});
