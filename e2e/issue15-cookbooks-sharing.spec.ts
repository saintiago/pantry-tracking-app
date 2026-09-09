import { test, expect } from '@playwright/test';
import type { Cookbook } from '@pantry/domain';
import { setupPlanner, meal, monday } from './helpers/planner';
test('cookbooks save covers and membership, survive reload, handle save failure and preserve recipes on removal', async ({
  page,
}) => {
  await setupPlanner(page, []);
  let books: Cookbook[] = [];
  let fail = true;
  await page.route('**/cookbooks**', (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: { cookbooks: books } });
    if (req.method() === 'DELETE') {
      books = [];
      return route.fulfill({ json: { message: 'Removed' } });
    }
    if (fail) {
      fail = false;
      return route.fulfill({
        status: 500,
        json: { message: 'Could not save cookbook. Try again.' },
      });
    }
    const book = {
      ...req.postDataJSON(),
      cookbookId: 'book-1',
      version: 1,
      createdAt: monday,
      updatedAt: monday,
    };
    books = [book];
    return route.fulfill({ status: 201, json: book });
  });
  const cover = '11111111-1111-4111-8111-111111111111';
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'green';
    ctx.fillRect(0, 0, 8, 8);
    return c.toDataURL();
  });
  await page.route('**/recipe-images', (route) =>
    route.fulfill({ status: 201, json: { imageId: cover } }),
  );
  await page.route(`**/recipe-images/${cover}`, (route) => route.fulfill({ json: { url: png } }));
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await page.getByRole('button', { name: '+ New Recipe', exact: true }).click();
  await page.getByRole('button', { name: 'New cookbook', exact: true }).click();
  await page.getByLabel('Cookbook name').fill('Weeknight favorites');
  await page.getByLabel('Description', { exact: true }).fill('Fast family meals');
  await page
    .getByRole('group', { name: 'Recipes in this cookbook' })
    .getByLabel('Pasta', { exact: true })
    .check();
  await page.getByLabel('Cookbook cover', { exact: true }).setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png.split(',')[1], 'base64'),
  });
  await expect(page.getByRole('button', { name: 'Save cookbook', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save cookbook', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save cookbook');
  await expect(page.getByLabel('Cookbook name')).toHaveValue('Weeknight favorites');
  await page.getByRole('button', { name: 'Save cookbook', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Pasta', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Apple bowl', exact: true })).toBeHidden();
  expect(books[0]).toMatchObject({
    description: 'Fast family meals',
    imageId: cover,
    recipeIds: ['pasta'],
  });
  await page.reload();
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open cookbook Weeknight favorites' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Pasta', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Open cookbook Weeknight favorites' }).click();
  await expect(page.getByRole('button', { name: 'View Pasta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove cookbook Weeknight favorites' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(books).toHaveLength(1);
  await page.getByRole('button', { name: 'Remove cookbook Weeknight favorites' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove cookbook', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'View Pasta', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Apple bowl', exact: true })).toBeVisible();
  expect(books).toHaveLength(0);
});
test('shopping arrangement, icons, native-share fallback and confirmed removal remain independent of basket and inventory', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }),
  );
  await setupPlanner(page, [meal('planned', monday)]);
  await page.evaluate(() =>
    localStorage.setItem(
      'pantry-companion-v1:test-user-id',
      JSON.stringify({
        manual: [
          {
            id: 'ginger',
            name: 'Ginger',
            quantity: 1,
            unit: 'piece',
            category: 'Food',
            store: '',
            notes: '',
            createdAt: '2026-09-08',
          },
          {
            id: 'fenugreek',
            name: 'Fenugreek',
            quantity: 50,
            unit: 'g',
            category: 'Food',
            store: '',
            notes: '',
            createdAt: '2026-09-07',
          },
        ],
        preferences: {},
        deferred: {},
        carry: {},
        history: [],
      }),
    ),
  );
  await page.getByRole('button', { name: 'Shop for these meals', exact: true }).click();
  await page.getByRole('button', { name: 'Shopping mode', exact: true }).click();
  await expect(
    page.getByRole('article', { name: 'Ginger shopping item', exact: true }),
  ).toContainText('🫚');
  await page.getByLabel('Arrange shopping list').selectOption('az');
  await expect(
    page.getByRole('region', { name: 'Shopping by store' }).getByRole('article'),
  ).toHaveText([/Fenugreek/, /Ginger/, /Pasta/]);
  await page.getByLabel('Arrange shopping list').selectOption('recent');
  await expect(
    page.getByRole('region', { name: 'Shopping by store' }).getByRole('article').first(),
  ).toContainText('Ginger');
  await page.getByRole('button', { name: 'Share Shopping List', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Text to share' })).toHaveValue(/Ginger.*1 piece/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('button', { name: 'Remove from shopping list: Ginger', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('article', { name: 'Ginger shopping item' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Remove from shopping list: Ginger', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove item', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Ginger shopping item' })).toHaveCount(0);
  await page.reload();
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: 'Shopping List', exact: true }).click();
  await page.getByRole('button', { name: 'Both weeks', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove from shopping list: Ginger', exact: true }),
  ).toHaveCount(0);
  await page.getByText('Removed from this list', { exact: false }).click();
  await page.getByRole('button', { name: 'Restore item', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove from shopping list: Ginger', exact: true }),
  ).toBeVisible();
});
for (const width of [320, 390, 1440])
  test(`planner sidebar favorites, servings and sharing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }),
    );
    const model = await setupPlanner(page, [meal('planned', monday)]);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await page.getByRole('slider', { name: 'Servings', exact: true }).press('ArrowRight');
    await expect(page.getByRole('slider', { name: 'Servings', exact: true })).toHaveValue('3');
    await page.getByRole('button', { name: 'Share Meal Plan', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Text to share' })).toHaveValue(
      /lunch: Pasta.*2 servings/,
    );
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    if (width < 760) await page.getByRole('button', { name: 'Recipe drawer', exact: true }).click();
    const library = page.getByRole('complementary', { name: 'Recipe library' });
    await expect(library.locator('summary').filter({ hasText: 'Prepared batches' })).toBeVisible();
    await library.getByText('Favorite Weeks/Days', { exact: true }).click();
    await library.getByLabel('Copy from', { exact: true }).selectOption('day');
    await library.getByLabel('Favorite plan name').fill('Easy day');
    await library.getByRole('button', { name: 'Save favorite day', exact: true }).click();
    await expect(
      library.getByRole('button', { name: 'Easy day · Day', exact: true }),
    ).toBeVisible();
    expect(model.state().favorites[0].kind).toBe('day');
    await library.getByRole('button', { name: 'Easy day · Day', exact: true }).click();
    await library.getByLabel('Destination start date').fill('2026-09-09');
    await library.getByRole('button', { name: 'Preview copy', exact: true }).click();
    await library.getByRole('button', { name: 'Apply copy', exact: true }).click();
    await expect.poll(() => model.state().mealPlans.length).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
