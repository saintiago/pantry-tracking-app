import { test, expect, type Page } from '@playwright/test';

const photo =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="green"/></svg>',
  );

async function setup(page: Page, options: { thresholdFail?: boolean; conflict?: boolean } = {}) {
  const items = [
    {
      itemId: 'old',
      groupId: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      quantity: 500,
      location: 'pantry',
      locationDetails: 'Shelf 1',
      expirationDate: '2027-01-01',
      barcode: '5901234123457',
      brand: 'Old brand',
      pictureUrl: '',
      createdAt: '2026-01-01',
      updatedAt: '2026-09-04',
    },
    {
      itemId: 'latest',
      groupId: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'g',
      quantity: 500,
      location: 'pantry',
      locationDetails: 'Shelf 2A',
      expirationDate: '2028-02-03',
      barcode: '5901234123457',
      brand: 'Latest brand',
      pictureUrl: photo,
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    },
  ];
  const group = {
    groupId: 'rice',
    canonicalKey: 'rice|grains|g',
    name: 'Rice',
    category: 'Grains',
    unit: 'g',
    threshold: 750 as number | undefined,
    thresholdUnit: 'g',
    totalQuantity: 1000,
    isLowStock: false,
    syncVersion: 1,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  await page.route('https://mock-api.test/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
    if (url.pathname === '/locations')
      return json({ locations: [{ locationId: 'pantry', name: 'Pantry' }] });
    if (url.pathname === '/inventory/search')
      return json({ items: [items[1]], count: 1, resultType: 'items' });
    if (url.pathname === '/inventory' && req.method() === 'GET')
      return json({ items, groups: [group] });
    if (req.method() === 'POST' || req.method() === 'PUT') {
      const body = req.postDataJSON();
      requests.push({ path: url.pathname, body });
      if (url.pathname === '/inventory/groups/rice') {
        if (options.conflict)
          return json(
            {
              error: 'INVENTORY_CONFLICT',
              message: 'Inventory changed concurrently. Refresh and try again.',
            },
            409,
          );
        if (options.thresholdFail) return json({ message: 'Threshold save failed' }, 500);
        group.threshold = body.threshold ?? undefined;
        group.thresholdUnit = body.thresholdUnit;
        group.isLowStock =
          group.threshold !== undefined &&
          group.totalQuantity <= group.threshold * (group.thresholdUnit === 'kg' ? 1000 : 1);
        return json({ group });
      }
      if (url.pathname === '/inventory') {
        const item = {
          ...body,
          itemId: 'new',
          groupId: 'rice',
          location: body.locationId,
          createdAt: '2026-09-04',
          updatedAt: '2026-09-04',
        };
        items.push(item);
        group.totalQuantity += body.quantity;
        return json({ item, groups: [group] }, 201);
      }
      const item = items.find((entry) => url.pathname.endsWith(`/${entry.itemId}`));
      if (item) {
        Object.assign(item, body, { location: body.locationId });
        return json({ item });
      }
    }
    return json({});
  });
  await page.goto('/');
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
  return { items, group, requests };
}

test('adding another product copies latest expiration, photo and location details while preserving its group threshold', async ({
  page,
}) => {
  const { items, group, requests } = await setup(page);
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
  await page.getByLabel('Product Name').fill('Ric');
  await page.getByRole('option').filter({ hasText: 'Rice' }).click();
  await expect(page.getByLabel('Expiration Date')).toHaveValue('2028-02-03');
  await expect(page.getByLabel('Location Details', { exact: true })).toHaveValue('Shelf 2A');
  await expect(page.getByLabel('Brand', { exact: true })).toHaveValue('Latest brand');
  await expect(page.getByRole('img', { name: 'Product photo' })).toHaveAttribute('src', photo);
  const location = (await page.getByLabel('Storage Location').boundingBox())!;
  const details = (await page.getByLabel('Location Details', { exact: true }).boundingBox())!;
  expect(details.y).toBeGreaterThan(location.y);
  await page.getByRole('button', { name: 'Add new item', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  expect(requests[0].body).toMatchObject({
    expirationDate: '2028-02-03',
    pictureUrl: photo,
    locationDetails: 'Shelf 2A',
    quantity: 500,
  });
  expect(items).toHaveLength(3);
  expect(group.threshold).toBe(750);
  await page.getByTestId('category-card-Grains').click();
  await expect(page.locator('[data-testid^="grouped-row-wrapper-"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Rice, 3 items/ })).toBeVisible();
});

test('Location Details are editable, survive reopening, and can be cleared', async ({ page }) => {
  const { items } = await setup(page);
  const open = async () => {
    await page.getByTestId('category-card-Grains').click();
    await page.getByRole('button', { name: /^Rice, 2 items/ }).click();
    await page.getByTestId('item-card-latest').click();
  };
  await open();
  await expect(page.getByLabel('Location Details')).toHaveValue('Shelf 2A');
  await page.getByLabel('Location Details').fill('Top shelf');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('category-card-Grains')).toBeVisible();
  expect(items[1].locationDetails).toBe('Top shelf');
  await open();
  await expect(page.getByLabel('Location Details')).toHaveValue('Top shelf');
  await page.getByLabel('Location Details').fill('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await open();
  await expect(page.getByLabel('Location Details')).toHaveValue('');
});

test('threshold unit selection persists, converts kg to g for low stock, and blank disables warnings', async ({
  page,
}) => {
  const { group, requests } = await setup(page);
  await page.getByTestId('category-card-Grains').click();
  const edit = page.getByRole('button', { name: 'Edit low-stock threshold for Rice' });
  await edit.click();
  await page.getByLabel('Low-stock threshold', { exact: true }).fill('1');
  await page.getByLabel('Threshold unit', { exact: true }).selectOption('kg');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(edit).toContainText('1 kilogram');
  expect(requests[0].body).toEqual({ threshold: 1, thresholdUnit: 'kg' });
  expect(group.isLowStock).toBe(true);
  await expect(page.getByRole('button', { name: /Rice,.*contains low stock/ })).toBeVisible();
  await edit.click();
  await expect(page.getByLabel('Threshold unit', { exact: true })).toHaveValue('kg');
  await page.getByLabel('Low-stock threshold', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: /Rice,.*contains low stock/ })).toHaveCount(0);
});

test('failed threshold save retains values for retry', async ({ page }) => {
  const options = { thresholdFail: true };
  await setup(page, options);
  await page.getByTestId('category-card-Grains').click();
  await page.getByRole('button', { name: 'Edit low-stock threshold for Rice' }).click();
  await page.getByLabel('Low-stock threshold', { exact: true }).fill('0.5');
  await page.getByLabel('Threshold unit', { exact: true }).selectOption('kg');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Threshold save failed');
  await expect(page.getByLabel('Low-stock threshold', { exact: true })).toHaveValue('0.5');
  options.thresholdFail = false;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Low-stock threshold', { exact: true })).toHaveCount(0);
});

test('concurrent threshold rejection preserves the draft, supports retry, and persists on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const options = { conflict: true };
  const { group, requests } = await setup(page, options);
  await page.getByTestId('category-card-Grains').click();
  await page.getByRole('button', { name: 'Edit low-stock threshold for Rice' }).click();
  await page.getByLabel('Low-stock threshold', { exact: true }).fill('0.5');
  await page.getByLabel('Threshold unit', { exact: true }).selectOption('kg');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Inventory changed concurrently. Refresh and try again.',
  );
  await expect(page.getByLabel('Low-stock threshold', { exact: true })).toHaveValue('0.5');
  expect(requests).toHaveLength(1);
  expect(group.threshold).toBe(750);
  options.conflict = false;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Low-stock threshold', { exact: true })).toHaveCount(0);
  await page.reload();
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByTestId('category-card-Grains').click();
  await expect(
    page.getByRole('button', { name: 'Edit low-stock threshold for Rice' }),
  ).toContainText('0.5 kilograms');
  expect(group.threshold).toBe(0.5);
  expect(group.thresholdUnit).toBe('kg');
});

test('typing an existing barcode keeps generic catalog data out of saved autofill', async ({
  page,
}) => {
  await setup(page);
  let externalLookups = 0;
  await page.route('https://mock-api.test/inventory/barcode-lookup', (route) => {
    externalLookups++;
    return route.fulfill({
      json: {
        found: true,
        product: { name: 'Generic rice', category: 'Generic category', brand: 'Generic brand' },
      },
    });
  });
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Manual Entry' }).click();
  await page.getByLabel('Barcode', { exact: true }).fill('5901234123457');
  await page.getByRole('option').filter({ hasText: 'Rice' }).click();
  await expect(page.getByLabel('Expiration Date')).toHaveValue('2028-02-03');
  await expect(page.getByLabel('Product Name')).toHaveValue('Rice');
  await expect(page.getByRole('textbox', { name: 'Category', exact: true })).toHaveValue('Grains');
  await expect(page.getByLabel('Brand', { exact: true })).toHaveValue('Latest brand');
  expect(externalLookups).toBe(0);
});
