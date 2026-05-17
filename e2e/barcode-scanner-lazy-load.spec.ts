import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Barcode Scanner Lazy Load
 *
 * Verifies the lazy-load UX behavior:
 * - The loading fallback appears while the scanner module is loading
 * - The scanner overlay appears after the module loads
 * - The loading fallback does NOT reappear on a second open (module is cached)
 *
 * Note: These tests run against the Vite dev server (not a production build).
 * In dev mode, Vite serves modules individually rather than as bundled chunks,
 * so chunk-filename-based assertions are not used here. The bundle split itself
 * is verified by `npm run verify:bundle` against a production build.
 *
 * Requires VITE_MOCK_AUTH=true (set in playwright.config.ts webServer env).
 * Backend API calls are mocked via Playwright route interception.
 */

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
        locations: [{ locationId: 'loc-1', name: 'Pantry', userId: 'test-user' }],
      }),
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
}

async function loginAndNavigateToInventory(page: Page) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForSelector('h2:has-text("Inventory")', { timeout: 10000 });
}

test.describe('Barcode Scanner Lazy Load', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page);
    await loginAndNavigateToInventory(page);
  });

  test('loading fallback is visible while the scanner module is loading', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Intercept BarcodeScanner module requests and delay them so we can observe the fallback.
    // In dev mode Vite serves the module as a JS file whose URL contains "BarcodeScanner".
    // In production the chunk filename also contains "BarcodeScanner".
    let resolveChunk!: () => void;
    const chunkDelayPromise = new Promise<void>((resolve) => {
      resolveChunk = resolve;
    });

    await page.route(/BarcodeScanner/, async (route) => {
      // Only delay JS module requests, not image/CSS/etc.
      const url = route.request().url();
      if (url.includes('.js') || url.includes('BarcodeScanner.tsx') || url.includes('BarcodeScanner.ts')) {
        await chunkDelayPromise;
      }
      await route.continue();
    });

    // Open the scanner
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Barcode Scan' }).click();

    // Loading fallback should be visible while the module is delayed
    await expect(page.getByTestId('barcode-scanner-loading')).toBeVisible({ timeout: 5000 });

    // Release the module
    resolveChunk();

    // Loading fallback should disappear once the module loads
    await expect(page.getByTestId('barcode-scanner-loading')).not.toBeVisible({ timeout: 10000 });
  });

  test('scanner overlay appears after the module loads', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Open the scanner
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Barcode Scan' }).click();

    // The scanner overlay should eventually appear once the module loads and BarcodeScanner mounts
    await expect(page.getByTestId('barcode-scanner-overlay')).toBeVisible({ timeout: 15000 });
  });

  test('loading fallback does NOT reappear on second scanner open (module cached)', async ({
    page,
  }) => {
    await page.waitForLoadState('networkidle');

    // First open — wait for scanner to fully load
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Barcode Scan' }).click();
    await expect(page.getByTestId('barcode-scanner-overlay')).toBeVisible({ timeout: 15000 });

    // Close the scanner
    await page.getByRole('button', { name: 'Close barcode scanner' }).click();
    await expect(page.getByTestId('barcode-scanner-overlay')).not.toBeVisible({ timeout: 5000 });

    // Second open — loading fallback should NOT appear (module is already cached by React.lazy)
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('menuitem', { name: 'Barcode Scan' }).click();

    // Scanner should appear without the loading fallback
    await expect(page.getByTestId('barcode-scanner-overlay')).toBeVisible({ timeout: 5000 });
    // Loading fallback should never have appeared on the second open
    await expect(page.getByTestId('barcode-scanner-loading')).not.toBeVisible();
  });
});
