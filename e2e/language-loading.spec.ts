import { test, expect } from '@playwright/test';

test.use({ locale: 'en-US', serviceWorkers: 'block' });
const catalogPattern = /\/src\/i18n\/locales\/(es|it)\.json(?:\?|$)/;

test('downloads only the chosen catalog and reuses it when switching back', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    const match = catalogPattern.exec(request.url());
    if (match && request.resourceType() === 'fetch') requested.push(match[1]);
  });
  await page.goto('/');
  await expect(page.locator('input[type=email]')).toBeVisible();
  expect(requested).toEqual([]);
  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByRole('button', { name: /Español/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(requested).toEqual(['es']);
  await page.getByRole('button', { name: /Italiano/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  expect(requested).toEqual(['es', 'it']);
  await page.getByRole('button', { name: /Español/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(requested).toEqual(['es', 'it']);
});

test('a saved Italian preference requests no Spanish catalog on a fresh page', async ({ page }) => {
  const requested: string[] = [];
  await page.addInitScript(() =>
    localStorage.setItem(
      'pantry-language-v1:guest',
      JSON.stringify({ language: 'it', source: 'explicit' }),
    ),
  );
  page.on('request', (request) => {
    const match = catalogPattern.exec(request.url());
    if (match && request.resourceType() === 'fetch') requested.push(match[1]);
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  expect(requested).toEqual(['it']);
});

test('a failed catalog download keeps the form and saved language, with a working retry on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  let fail = true;
  await page.route(/\/src\/i18n\/locales\/es\.json(?:\?|$)/, (route) =>
    fail && route.request().resourceType() === 'fetch' ? route.abort('failed') : route.continue(),
  );
  await page.goto('/');
  await page.locator('input[type=email]').fill('unsaved@example.com');
  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByRole('button', { name: /Español/ }).click();
  await expect(page.getByRole('alert')).toContainText('Could not load Español');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('pantry-language-v1:guest')!).language,
    ),
  ).toBe('en');
  fail = false;
  await page.getByRole('button', { name: 'Retry language download' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('input[type=email]')).toHaveValue('unsaved@example.com');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('pantry-language-v1:guest')!).language,
    ),
  ).toBe('es');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
