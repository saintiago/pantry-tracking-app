import { test, expect } from '@playwright/test';

const catalogPattern = /\/assets\/(es|it)-[^/]+\.json$/;
test('production fetches only the selected catalog, never all catalogs with the app or menu', async ({
  page,
}) => {
  const catalogs: string[] = [];
  page.on('request', (request) => {
    const match = catalogPattern.exec(request.url());
    if (match) catalogs.push(match[1]);
  });
  await page.goto('/');
  await expect(page.locator('input[type=email]')).toBeVisible();
  expect(catalogs).toEqual([]);
  await page.getByRole('button', { name: 'Change language' }).click();
  expect(catalogs).toEqual([]);
  await page.getByRole('button', { name: /Español/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(catalogs).toEqual(['es']);
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: /Español/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(catalogs).toEqual(['es']);
});

test('fresh saved Italian sessions download only Italian', async ({ page }) => {
  const catalogs: string[] = [];
  await page.addInitScript(() =>
    localStorage.setItem(
      'pantry-language-v1:guest',
      JSON.stringify({ language: 'it', source: 'explicit' }),
    ),
  );
  page.on('request', (request) => {
    const match = catalogPattern.exec(request.url());
    if (match) catalogs.push(match[1]);
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  expect(catalogs).toEqual(['it']);
});

test('cached catalogs survive offline reload; an unvisited language fails safely and retries online', async ({
  page,
  context,
}) => {
  let offline = false;
  // Route at context level so the simulated outage also covers service-worker fetches.
  await context.route(/\/assets\/it-[^/]+\.json$/, (route) =>
    offline ? route.abort('internetdisconnected') : route.continue(),
  );
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // The controlled navigation caches the app shell as well as requested catalogs.
  await page.reload();
  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByRole('button', { name: /Español/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const keys = await caches.keys();
        for (const key of keys) {
          const cache = await caches.open(key);
          if ((await cache.keys()).some((request) => /\/assets\/es-[^/]+\.json$/.test(request.url)))
            return true;
        }
        return false;
      }),
    )
    .toBe(true);
  offline = true;
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.locator('input[type=email]').fill('draft@example.com');
  await page.getByRole('button', { name: 'Cambiar idioma' }).click();
  await page.getByRole('button', { name: /Italiano/ }).click();
  await expect(page.getByRole('alert')).toContainText('Italiano');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('input[type=email]')).toHaveValue('draft@example.com');
  offline = false;
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reintentar la descarga del idioma' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.locator('input[type=email]')).toHaveValue('draft@example.com');
});
