import { test, expect, type Page } from '@playwright/test';
import type { InventoryItem } from '../frontend/src/domain/inventory/types';

async function setup(page: Page) {
  const items: InventoryItem[] = [
    {
      itemId: 'soap',
      name: 'Dish soap',
      category: 'Household-Cleaning Products',
      quantity: 3,
      unit: 'bottle',
      expirationDate: null,
      icon: '🧼',
      location: 'pantry',
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
    {
      itemId: 'soap2',
      name: 'Dish soap',
      category: 'Household-Cleaning Products',
      quantity: 2,
      unit: 'bottle',
      expirationDate: null,
      icon: '🧼',
      location: 'cupboard',
      createdAt: '2026-08-01',
      updatedAt: '2026-08-01',
      isLowStock: true,
    },
    {
      itemId: 'bread',
      name: 'Bread',
      category: 'Bakery',
      quantity: 1,
      unit: 'piece',
      expirationDate: '2028-01-01',
      location: 'pantry',
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
  ];
  const state = { items, failDelete: false, writes: [] as Record<string, unknown>[] };
  await page.route('https://mock-api.test/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
    if (path === '/locations')
      return json({
        locations: [
          { locationId: 'pantry', name: 'Pantry' },
          { locationId: 'cupboard', name: 'Cupboard' },
        ],
      });
    if (path === '/inventory/search')
      return json({ items: [items[0]], resultType: 'items', count: 1 });
    if (path === '/inventory' && request.method() === 'GET') return json({ items, groups: [] });
    if (path === '/inventory' && request.method() === 'POST') {
      const body = request.postDataJSON();
      state.writes.push(body);
      const item = {
        ...body,
        itemId: 'new',
        location: body.locationId,
        createdAt: '2026-09-07',
        updatedAt: '2026-09-07',
      };
      items.push(item);
      return json({ item }, 201);
    }
    if (path.startsWith('/inventory/') && request.method() === 'PUT') {
      const body = request.postDataJSON();
      state.writes.push(body);
      const item = items.find((item) => path.endsWith('/' + item.itemId))!;
      Object.assign(item, body, { location: body.locationId });
      return json({ item });
    }
    if (path.startsWith('/inventory/') && request.method() === 'DELETE') {
      if (state.failDelete) return json({ message: 'Unavailable' }, 500);
      const index = items.findIndex((item) => path.endsWith('/' + item.itemId));
      items.splice(index, 1);
      return route.fulfill({ status: 204 });
    }
    return json({});
  });
  await page.goto('/');
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await expect(page.getByTestId('category-card-Bakery')).toBeVisible();
  return state;
}

async function openSoap(page: Page) {
  await page.getByTestId('category-card-Household-Cleaning Products').click();
  await page.getByRole('button', { name: /^Dish soap, 2 items/ }).click();
}

test('N/A and icon survive add, reload and edit; reusing a product copies quantity and unit', async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
  await page.getByLabel('Product Name').fill('Dis');
  await page.getByRole('option').filter({ hasText: 'Dish soap' }).click();
  await expect(page.getByRole('checkbox', { name: 'Not applicable' })).toBeChecked();
  await expect(page.getByLabel('Expiration Date')).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Quantity', exact: true })).toHaveValue('3');
  await expect(page.getByRole('combobox', { name: 'Unit', exact: true })).toHaveValue('bottle');
  await expect(page.getByLabel('Product icon')).toHaveValue('🧼');
  await page.getByLabel('Product icon').selectOption('🧽');
  await page.getByRole('button', { name: 'Add new item', exact: true }).click();
  await expect(page.getByTestId('category-card-Bakery')).toBeVisible();
  expect(state.writes[0]).toMatchObject({
    expirationDate: null,
    quantity: 3,
    unit: 'bottle',
    icon: '🧽',
  });
  await page.reload();
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByTestId('category-card-Household-Cleaning Products').click();
  await page.getByRole('button', { name: /^Dish soap, 3 items/ }).click();
  const card = page.getByTestId('item-card-new');
  await expect(card).toContainText('Not applicable');
  await expect(card).toContainText('🧽');
  await card.click();
  await expect(page.getByRole('checkbox', { name: 'Not applicable' })).toBeChecked();
  await expect(page.getByText('Pantry', { exact: true }).first()).toBeVisible();
  await page.getByRole('checkbox', { name: 'Not applicable' }).uncheck();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Expiration date is required.');
  await page.getByLabel('Expiration Date').fill('2028-12-31');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('category-card-Bakery')).toBeVisible();
  expect(state.items.find((item) => item.itemId === 'new')?.expirationDate).toBe('2028-12-31');
});

test('mobile category colors, location tags, red low stock and confirmed quick removal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const state = await setup(page);
  await expect(page.getByTestId('category-card-Household-Cleaning Products')).toHaveCSS(
    'background-color',
    'rgb(223, 240, 234)',
  );
  await expect(page.getByTestId('category-card-Bakery')).toHaveCSS(
    'background-color',
    'rgb(243, 227, 202)',
  );
  await expect(page.getByTestId('category-card-Household-Cleaning Products')).toContainText(
    'Mixed locations',
  );
  await openSoap(page);
  await expect(page.getByTestId('item-card-soap')).toContainText('Pantry');
  await expect(page.getByTestId('item-card-soap2')).toContainText('Cupboard');
  await expect(page.getByTestId('item-card-soap2').getByLabel('Low stock')).toHaveCSS(
    'background-color',
    'rgb(255, 229, 229)',
  );
  await page.screenshot({ path: 'test-results/inventory-issues-11-12-mobile.png', fullPage: true });
  const remove = page
    .getByTestId('item-card-soap')
    .getByRole('button', { name: 'Remove Dish soap', exact: true });
  await expect(remove).toHaveCSS('background-color', 'rgb(255, 229, 229)');
  page.once('dialog', (dialog) => dialog.dismiss());
  await remove.click();
  expect(state.items).toHaveLength(3);
  await expect(page.getByTestId('item-card-soap')).toBeVisible();
  state.failDelete = true;
  page.once('dialog', (dialog) => dialog.accept());
  await remove.click();
  await expect(page.getByRole('alert')).toContainText('Could not remove item');
  expect(state.items).toHaveLength(3);
  state.failDelete = false;
  page.once('dialog', (dialog) => dialog.accept());
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('item-card-soap')).toHaveCount(0);
  await expect(page.getByTestId('item-card-soap2')).toBeVisible();
  expect(state.items).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.reload();
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  expect(state.items.some((item) => item.itemId === 'soap')).toBe(false);
});
