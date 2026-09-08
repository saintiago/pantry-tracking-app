import { test, expect, type Page } from '@playwright/test';
import { setupPlanner, meal } from './helpers/planner';
async function settings(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Settings', exact: true }).click();
}
async function back(page: Page) {
  await page.getByRole('button', { name: 'Back to previous page', exact: true }).click();
}
test('reversible recipe conversion, converted editing, shopping and share quantities', async ({
  page,
}) => {
  const data = await setupPlanner(page, [meal('today', '2026-09-07')]);
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await page.getByRole('button', { name: 'View Pasta', exact: true }).click();
  await settings(page);
  await page.getByLabel('Measurement system').selectOption('imperial');
  await back(page);
  await expect(page.getByText('14.11 ounces', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Ingredient 1 unit')).toHaveValue('oz');
  await page.getByLabel('Ingredient 1 quantity').fill('16');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByText('16 ounces', { exact: true })).toBeVisible();
  expect(data.recipes[0].ingredients[0].quantity).toBeCloseTo(453.59237, 8);
  expect(data.recipes[0].ingredients[0].unit).toBe('g');
  await settings(page);
  await page.getByLabel('Measurement system').selectOption('metric');
  await back(page);
  await expect(page.getByText('453.59 grams', { exact: true })).toBeVisible();
  await settings(page);
  await page.getByLabel('Measurement system').selectOption('imperial');
  await page.getByRole('button', { name: 'Shopping List', exact: true }).click();
  await expect(
    page.getByRole('article', { name: 'Pasta meal ingredient', exact: true }),
  ).toContainText('Buy 8 oz');
  await page.getByRole('button', { name: 'Share Shopping List', exact: true }).click();
  await expect(page.getByLabel('Text to share')).toHaveValue(/Pasta — 8 oz/);
});
test('unit customization persists and Settings preserves unfinished recipe fields', async ({
  page,
}) => {
  await setupPlanner(page, []);
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await page.getByRole('button', { name: '+ New Recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Add manually', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Unfinished recipe');
  await settings(page);
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Change language' }),
  ).toHaveCount(0);
  await page.getByText('Manage units', { exact: true }).click();
  await page.getByRole('button', { name: 'Remove unit gram', exact: true }).click();
  await page.getByLabel('Available units').selectOption('oz');
  await page.getByRole('button', { name: 'Add unit', exact: true }).click();
  await page.getByRole('button', { name: 'Move ounce up', exact: true }).click();
  const order = await page
    .getByRole('list', { name: 'Unit order' })
    .locator('li > span')
    .allTextContents();
  await back(page);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
    'Unfinished recipe',
  );
  const picker = page.getByLabel('Ingredient 1 unit');
  await expect(picker.locator('option[value=g]')).toHaveCount(0);
  await expect(picker.locator('option[value=oz]')).toHaveCount(1);
  await page.reload();
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await settings(page);
  await page.getByText('Manage units', { exact: true }).click();
  expect(
    await page.getByRole('list', { name: 'Unit order' }).locator('li > span').allTextContents(),
  ).toEqual(order);
  await page.getByLabel('Available units').selectOption('g');
  await page.getByRole('button', { name: 'Add unit', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Unit order' })).toContainText('gram');
});
test('inventory edits preserve conversion accuracy and unchanged recorded units', async ({
  page,
}) => {
  await setupPlanner(page, []);
  let item = {
    itemId: 'flour',
    name: 'Flour',
    category: 'Pantry',
    unit: 'g',
    quantity: 453.59237,
    location: 'pantry',
    expirationDate: null,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  };
  await page.route('**/inventory', (route) =>
    route.fulfill({ json: { items: [item], groups: [] } }),
  );
  await page.route('**/inventory/flour', (route) => {
    if (route.request().method() === 'PUT') item = { ...item, ...route.request().postDataJSON() };
    return route.fulfill({ json: { item } });
  });
  await settings(page);
  await page.getByLabel('Measurement system').selectOption('imperial');
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(page.getByTestId('category-card-Pantry')).toContainText('16 ounces');
  await page.getByTestId('category-card-Pantry').click();
  await page.getByRole('button', { name: /^Flour, 1 item/ }).click();
  await page.getByTestId('item-card-flour').click();
  await expect(page.getByRole('textbox', { name: 'Quantity', exact: true })).toHaveValue('16');
  await expect(page.getByRole('combobox', { name: 'Unit', exact: true })).toHaveValue('oz');
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('8');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('category-card-Pantry')).toContainText('8 ounces');
  expect(item.quantity).toBeCloseTo(226.796185, 9);
  expect(item.unit).toBe('g');
});
for (const width of [320, 390])
  test(`appearance, help and system color changes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await setupPlanner(page, []);
    await settings(page);
    await page.getByLabel('App appearance').selectOption('minimal');
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'minimal');
    await expect(page.getByRole('navigation')).not.toContainText('📖');
    expect(await page.locator('body').evaluate((element) => getComputedStyle(element).color)).toBe(
      'rgb(17, 17, 17)',
    );
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await page.getByLabel('Search help').fill('imports');
    await expect(page.getByText('Recipes, imports and cookbooks', { exact: true })).toBeVisible();
    await page.getByLabel('Search help').fill('does not place an order');
    await expect(
      page.getByText(
        'Order preview shows estimated costs and product links. It does not place an order or import receipts.',
        { exact: true },
      ),
    ).toBeVisible();
    await settings(page);
    await page.getByLabel('App appearance').selectOption('system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect
      .poll(() =>
        page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe('rgb(21, 24, 29)');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect
      .poll(() =>
        page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe('rgb(250, 250, 250)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByLabel('App appearance').selectOption('pastel');
    await expect(page.getByRole('navigation')).toContainText('📖');
  });
