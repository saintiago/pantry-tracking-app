import { test, expect, type Page } from '@playwright/test';

async function setup(
  page: Page,
  options: {
    fail?: boolean;
    empty?: boolean;
    purchaseFail?: boolean;
    locationsFail?: boolean;
  } = {},
) {
  await page.clock.setFixedTime(new Date('2026-09-08T12:00:00Z'));
  const recipes = [
    {
      recipeId: 'curry',
      name: 'Vegetable curry',
      portions: 4,
      tags: ['dinner'],
      ingredients: [
        { name: 'Rice', quantity: 400, unit: 'g' },
        { name: 'Basil', quantity: null, unit: 'handful' },
      ],
    },
    {
      recipeId: 'salad',
      name: 'Tomato salad',
      portions: 2,
      tags: ['lunch'],
      ingredients: [
        { name: 'Rice', quantity: 0.2, unit: 'kg' },
        { name: 'Tomatoes', quantity: 500, unit: 'g' },
      ],
    },
  ];
  const groups = [
    {
      groupId: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'kg',
      totalQuantity: 0.3,
      threshold: 1,
      isLowStock: true,
    },
    {
      groupId: 'soap',
      name: 'Dish soap',
      category: 'Household',
      unit: 'bottle',
      totalQuantity: 0,
      threshold: 1,
      isLowStock: true,
    },
  ];
  const items = [
    {
      itemId: 'rice-lot',
      groupId: 'rice',
      name: 'Rice',
      category: 'Grains',
      unit: 'kg',
      quantity: 0.3,
      expirationDate: '2026-10-01',
      location: 'pantry',
    },
  ];
  const plans = [
    {
      planId: 'past',
      recipeId: 'curry',
      recipeName: 'Vegetable curry',
      date: '2026-09-07',
      mealType: 'dinner',
      servings: 4,
    },
    {
      planId: 'today',
      recipeId: 'curry',
      recipeName: 'Vegetable curry',
      date: '2026-09-08',
      mealType: 'dinner',
      servings: 4,
    },
    {
      planId: 'tomorrow',
      recipeId: 'salad',
      recipeName: 'Tomato salad',
      date: '2026-09-09',
      mealType: 'lunch',
      servings: 2,
    },
    {
      planId: 'next',
      recipeId: 'curry',
      recipeName: 'Vegetable curry',
      date: '2026-09-15',
      mealType: 'dinner',
      servings: 4,
    },
  ];
  const purchases: Record<string, unknown>[] = [];
  let inventoryPages = 0;
  await page.route('https://mock-api.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === '/inventory' && request.method() === 'POST') {
      const body = request.postDataJSON();
      purchases.push(body);
      if (options.purchaseFail) return json({ message: 'Could not save purchase' }, 500);
      if (body.name === 'Rice' && body.unit === 'kg') {
        items[0].quantity += body.quantity;
        groups[0].totalQuantity += body.quantity;
        groups[0].isLowStock = groups[0].totalQuantity <= 1;
      } else
        items.push({
          ...body,
          itemId: 'purchased',
          groupId: 'new-product',
          location: body.locationId,
        });
      return json({ item: { ...body, itemId: 'purchased' } }, 201);
    }
    if (url.pathname === '/inventory') {
      inventoryPages++;
      if (url.searchParams.has('lastEvaluatedKey'))
        return json({ items: options.empty ? [] : items, groups: options.empty ? [] : groups });
      return json({
        items: [],
        groups: options.empty ? [] : groups,
        lastEvaluatedKey: 'next-page',
      });
    }
    if (url.pathname === '/locations')
      return options.locationsFail
        ? json({ message: 'Locations unavailable' }, 500)
        : json({ locations: [{ locationId: 'pantry', name: 'Pantry' }] });
    if (url.pathname === '/recipes/tags') return json({ tags: ['dinner', 'lunch'] });
    if (url.pathname === '/recipes')
      return options.fail
        ? json({ message: 'Recipes unavailable' }, 500)
        : json({ recipes: options.empty ? [] : recipes });
    if (url.pathname === '/meal-plans')
      return json({
        mealPlans: options.empty
          ? []
          : plans.filter(
              (p) =>
                p.date >= url.searchParams.get('startDate')! &&
                p.date <= url.searchParams.get('endDate')!,
            ),
      });
    return json({});
  });
  const login = async () => {
    await page.locator('input[type=email]').fill('test@example.com');
    await page.locator('input[type=password]').fill('TestPassword123!');
    await page.locator('button[type=submit]').click();
    await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Shopping List', exact: true }).click();
    await page.getByText('Day and recipe filters', { exact: true }).click();
  };
  await page.goto('/');
  await login();
  await expect(page.getByText('Updating shopping list…')).toBeHidden();
  return { plans, recipes, purchases, options, login, pages: () => inventoryPages };
}
const meals = (page: Page) => page.getByRole('region', { name: 'Ingredients for planned meals' });
const low = (page: Page) => page.getByRole('region', { name: 'Low-stock inventory', exact: true });
const rice = (page: Page) => page.getByRole('article', { name: 'Rice meal ingredient' });

test('selected filters are mint; departments and automatic reserves reflect meals and full inventory', async ({
  page,
}) => {
  const fixture = await setup(page);
  const selected = 'rgb(216, 243, 220)';
  await expect(page.getByRole('button', { name: 'This week', exact: true })).toHaveCSS(
    'background-color',
    selected,
  );
  await expect(rice(page)).toContainText('Buy 1300 g');
  await expect(rice(page)).toContainText('Needed 600 g · In inventory for these meals 300 g');
  await expect(meals(page).getByRole('heading', { name: 'Pantry', exact: true })).toBeVisible();
  await expect(
    meals(page).getByRole('heading', { name: 'Fruit & vegetables', exact: true }),
  ).toBeVisible();
  await expect(low(page)).toContainText('Dish soap');
  expect(fixture.pages()).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Vegetable curry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vegetable curry', exact: true })).toHaveCSS(
    'background-color',
    selected,
  );
  await expect(rice(page)).toContainText('Buy 1100 g');
  await page.getByRole('button', { name: 'Wed, Sep 9', exact: true }).click();
  await expect(page.getByText('No meals planned for these filters.')).toBeVisible();
  await expect(low(page)).toContainText('Buy 700 g to complete the 1000 g threshold');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('button', { name: 'Next week only' }).click();
  await expect(page.getByRole('button', { name: 'Next week only' })).toHaveCSS(
    'background-color',
    selected,
  );
  await page.getByRole('button', { name: 'Both weeks' }).click();
  await expect(page.getByRole('button', { name: 'Both weeks' })).toHaveCSS(
    'background-color',
    selected,
  );
  await expect(rice(page)).toContainText('Buy 1700 g');
  await page.getByRole('button', { name: 'Previous week', exact: true }).click();
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await page.getByLabel('Week of').fill('2026-10-01');
  await expect(page.getByText('No meals planned for these filters.')).toBeVisible();
});

test('past days, multiple selections, search and covered ingredients are preserved', async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel('Include past days').check();
  await expect(rice(page)).toContainText('Buy 1700 g');
  await page.getByLabel('Include past days').uncheck();
  await page.getByRole('button', { name: 'Wed, Sep 9', exact: true }).click();
  await page.getByLabel('Show ingredients already in stock').check();
  await expect(rice(page)).toContainText('In inventory for these meals 200 g');
  await page.getByRole('button', { name: 'Tue, Sep 8', exact: true }).click();
  await page.getByRole('button', { name: 'Vegetable curry', exact: true }).click();
  await page.getByRole('button', { name: 'Tomato salad', exact: true }).click();
  await expect(rice(page)).toContainText('Buy 1300 g');
  await page.getByLabel('Search ingredients').fill('soap');
  await expect(page.getByText('No ingredients match your search.')).toBeVisible();
  await expect(low(page)).toContainText('Dish soap');
});

test('linked checkboxes survive reload and increased meal quantities need review', async ({
  page,
}) => {
  const { plans, login } = await setup(page);
  await rice(page).getByRole('checkbox').click();
  await meals(page).getByText('In basket (1)', { exact: true }).click();
  await low(page).getByText('In basket (1)', { exact: true }).click();
  await expect(low(page).getByLabel('In basket: Rice')).toBeChecked();
  await page.reload();
  await login();
  await meals(page).getByText('In basket (1)', { exact: true }).click();
  await expect(rice(page).getByRole('checkbox')).toBeChecked();
  plans[1].servings = 8;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(rice(page)).toContainText('Needs review');
  await expect(rice(page).getByRole('checkbox')).not.toBeChecked();
});

test('full purchase form edits all inventory fields, retries and retains a partial requirement', async ({
  page,
}) => {
  const options = { purchaseFail: true, locationsFail: false };
  const { purchases } = await setup(page, options);
  await rice(page).getByRole('checkbox').click();
  await meals(page).getByText('In basket (1)', { exact: true }).click();
  options.locationsFail = true;
  await rice(page).getByRole('button', { name: 'Add purchases to inventory' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not load storage locations');
  options.locationsFail = false;
  await page.getByRole('button', { name: 'Retry locations' }).click();
  await expect(page.getByRole('heading', { name: 'Add purchases to inventory' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Quantity', exact: true })).toHaveValue('1.3');
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  expect(purchases).toHaveLength(0);
  await page.getByRole('textbox', { name: 'Product Name', exact: true }).fill('Rice');
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('1');
  await page.getByRole('combobox', { name: 'Unit', exact: true }).selectOption('kg');
  await page.getByRole('textbox', { name: 'Category', exact: true }).fill('Grains');
  await page
    .getByRole('combobox', { name: 'Storage Location', exact: true })
    .selectOption('pantry');
  await page.getByRole('textbox', { name: 'Location Details', exact: true }).fill('Top shelf');
  await page.getByRole('textbox', { name: 'Expiration Date', exact: true }).fill('2027-01-01');
  await page.getByRole('textbox', { name: 'Brand', exact: true }).fill('Test brand');
  await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill('1234567890128');
  await page
    .getByRole('textbox', { name: 'Online Store Link', exact: true })
    .fill('https://www.carrefour.es/supermercado');
  await page.locator('input[type=file]').setInputFiles({
    name: 'rice.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('textbox', { name: 'Where to Buy', exact: true }).fill('Carrefour');
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save purchase');
  options.purchaseFail = false;
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Purchase added to inventory' })).toBeVisible();
  expect(purchases[1]).toMatchObject({
    name: 'Rice',
    category: 'Grains',
    unit: 'kg',
    quantity: 1,
    locationDetails: 'Top shelf',
    brand: 'Test brand',
    barcode: '1234567890128',
    onlineStoreLink: 'https://www.carrefour.es/supermercado',
    pictureUrl: expect.stringContaining('data:image/png;base64,'),
    whereToBuy: 'Carrefour',
  });
  await page.getByRole('button', { name: 'Back to shopping list' }).click();
  await expect(rice(page)).toContainText('Buy 300 g');
});

async function manual(page: Page, name = 'Sponges', quantity = '3') {
  await page.getByRole('button', { name: 'Add something to buy', exact: true }).click();
  await page.getByLabel('Item name', { exact: true }).fill(name);
  await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill(quantity);
  await page.getByLabel('Supermarket department').selectOption('Household');
  await page.getByLabel('Where to buy', { exact: true }).fill('Costco');
  await page.getByLabel('Notes', { exact: true }).fill('Kitchen supplies');
  await page.getByRole('button', { name: 'Save manual item' }).click();
}

test('manual entries carry across weeks, can be edited/removed/undone, and partial purchases remain', async ({
  page,
}) => {
  const { purchases } = await setup(page);
  await manual(page);
  const entry = () => page.getByRole('article', { name: 'Sponges manual item' });
  await expect(entry()).toContainText('Buy 3 piece');
  await page.getByRole('button', { name: 'Next week only' }).click();
  await expect(entry()).toContainText('Costco');
  await entry().getByText('Options for Sponges').click();
  await entry().getByRole('button', { name: 'Edit manual entry' }).click();
  await page.getByLabel('Notes').fill('Soft sponges');
  await page.getByRole('button', { name: 'Save manual item' }).click();
  await expect(entry()).toContainText('Soft sponges');
  await entry().getByRole('checkbox').click();
  await page
    .getByRole('region', { name: 'Other things to buy', exact: true })
    .getByText('In basket (1)', { exact: true })
    .click();
  await entry().getByRole('button', { name: 'Add purchases to inventory' }).click();
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('1');
  await page
    .getByRole('combobox', { name: 'Storage Location', exact: true })
    .selectOption('pantry');
  await page.getByRole('textbox', { name: 'Expiration Date', exact: true }).fill('2030-01-01');
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Purchase added to inventory' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to shopping list' }).click();
  await expect(entry()).toContainText('Buy 2 piece');
  expect(purchases).toHaveLength(1);
  await entry().getByText('Options for Sponges').click();
  await entry().getByRole('button', { name: 'Remove manual entry' }).click();
  await expect(entry()).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo removal' }).click();
  await expect(entry()).toContainText('Buy 2 piece');
});

test('preferences round packages, organize Shopping mode and produce an honest budget preview', async ({
  page,
}) => {
  await setup(page);
  await rice(page).getByText('Options for Rice').click();
  await rice(page).getByRole('button', { name: 'Product preferences' }).click();
  await page.getByLabel('Preferred store', { exact: true }).fill('Carrefour');
  await page.getByLabel('Alternative store').fill('Costco');
  await page.getByLabel('Package size', { exact: true }).fill('1');
  await page.getByRole('combobox', { name: 'Package unit', exact: true }).selectOption('kg');
  await page.getByLabel('Estimated price per package (€)').fill('2.50');
  await page
    .getByLabel('Product link', { exact: true })
    .fill('https://www.carrefour.es/supermercado');
  await page.getByLabel('Allow substitutions in order plans').check();
  await page.getByLabel('Preferred replacement').fill('Brown rice');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(rice(page)).toContainText('2 packages × 1 kg · 700 g beyond this list');
  await page.getByRole('button', { name: 'Shopping mode', exact: true }).click();
  const shop = page.getByRole('region', { name: 'Shopping by store', exact: true });
  await expect(shop.getByRole('article', { name: 'Rice shopping item' })).toHaveCount(1);
  await page.getByLabel('Filter by store').selectOption({ label: 'Carrefour' });
  await expect(shop).not.toContainText('Dish soap');
  await page.getByRole('button', { name: 'Order preview', exact: true }).click();
  await page.getByLabel('Shopping budget (€)').fill('4');
  await page.getByLabel('Maximum delivery fee (€)').fill('2');
  await expect(page.getByRole('alert')).toContainText('exceeds your shopping budget');
  await expect(page.getByRole('region', { name: 'Order preview' })).toContainText(
    'Known product estimate: €5.00',
  );
  await expect(page.getByRole('link', { name: 'Open product at retailer' })).toHaveAttribute(
    'href',
    'https://www.carrefour.es/supermercado',
  );
  await expect(page.getByLabel('Shopping list text')).toContainText('Carrefour / Pantry: Rice');
  await page.getByRole('button', { name: 'Copy shopping list' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: /copied|Copy is unavailable/ }),
  ).toBeVisible();
});

test('unavailable, skip and dated postponement retain outstanding items and allow return', async ({
  page,
}) => {
  await setup(page);
  await rice(page).getByText('Options for Rice').click();
  await rice(page).getByRole('button', { name: 'Unavailable here' }).click();
  const pending = page.getByRole('region', { name: 'Later and unavailable', exact: true });
  await expect(pending).toContainText('Unavailable at this store');
  await pending.getByRole('button', { name: 'Return to list' }).click();
  await rice(page).getByText('Options for Rice').click();
  await rice(page).getByRole('button', { name: 'Skip this trip' }).click();
  await expect(pending).toContainText('Skipped for this period');
  await pending.getByRole('button', { name: 'Return to list' }).click();
  await rice(page).getByText('Options for Rice').click();
  await rice(page).getByLabel('Buy on date: Rice').fill('2026-09-20');
  await expect(pending).toContainText('Buy on 2026-09-20');
  await pending.getByRole('button', { name: 'Return to list' }).click();
  await rice(page).getByText('Options for Rice').click();
  await rice(page).getByRole('button', { name: 'Buy next week' }).click();
  await expect(pending).toContainText('Buy on 2026-09-15');
});

test('failure, reconnect, missing recipes and storage errors stay explicit', async ({ page }) => {
  const options = { fail: true };
  const { recipes, plans } = await setup(page, options);
  await expect(page.getByRole('alert')).toContainText('Recipes unavailable');
  options.fail = false;
  await page.getByRole('button', { name: 'Retry shopping list' }).click();
  await expect(rice(page)).toContainText('Buy 1300 g');
  plans[1].servings = 8;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(rice(page)).toContainText('Buy 1700 g');
  options.fail = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Showing the last loaded list');
  await expect(rice(page).getByRole('checkbox')).toBeDisabled();
  options.fail = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(rice(page).getByRole('checkbox')).toBeEnabled();
  recipes.splice(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('Recipe unavailable');
  await expect(
    page.getByText('Some planned recipes could not be calculated. Review the warning above.'),
  ).toBeVisible();
});

test('new palette is consistent across the app and mobile shopping has no overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 250, 250)');
  await expect(page.getByRole('heading', { name: 'Shopping List', exact: true })).toHaveCSS(
    'color',
    'rgb(43, 45, 66)',
  );
  await page.screenshot({ path: 'test-results/companion-desktop.png', fullPage: true });
  await page.getByText('Day and recipe filters', { exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: 'test-results/companion-mobile.png', fullPage: true });
  for (const tab of ['Inventory', 'Recipes', 'Meal Plan']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 250, 250)');
    await expect(page.locator('h1').first()).toHaveCSS('color', 'rgb(43, 45, 66)');
  }
});

test('explicit package conversion updates generated demand and cancel does not add stock', async ({
  page,
}) => {
  const { purchases } = await setup(page);
  await rice(page).getByRole('checkbox').click();
  await meals(page).getByText('In basket (1)', { exact: true }).click();
  await rice(page).getByRole('button', { name: 'Add purchases to inventory' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(purchases).toHaveLength(0);
  await meals(page).getByText('In basket (1)', { exact: true }).click();
  await rice(page).getByRole('button', { name: 'Add purchases to inventory' }).click();
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('1');
  await page.getByRole('combobox', { name: 'Unit', exact: true }).selectOption('bottle');
  await page.getByRole('textbox', { name: 'Expiration Date', exact: true }).fill('2027-01-01');
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Units differ');
  expect(purchases).toHaveLength(0);
  await page.getByText('Changing between packages and ingredient units?', { exact: true }).click();
  await page.getByLabel('Shopping quantity covered', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Purchase added to inventory' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to shopping list', exact: true }).click();
  await expect(rice(page)).toContainText('Buy 300 g');
  expect(purchases).toHaveLength(1);
});

test('storage failures are visible and alternate store restores an unavailable product', async ({
  page,
}) => {
  await setup(page);
  await rice(page).getByText('Options for Rice').click();
  await rice(page).getByRole('button', { name: 'Product preferences' }).click();
  await page.getByLabel('Preferred store', { exact: true }).fill('Carrefour');
  await page.getByLabel('Alternative store', { exact: true }).fill('Costco');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await rice(page).getByText('Options for Rice').click();
  await rice(page).getByRole('button', { name: 'Unavailable here' }).click();
  const pending = page.getByRole('region', { name: 'Later and unavailable', exact: true });
  await pending.getByText('Options for Rice').click();
  await pending.getByRole('button', { name: 'Try Costco', exact: true }).click();
  await expect(rice(page)).toContainText('Costco');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage full');
    };
  });
  await rice(page).getByRole('checkbox').click();
  await expect(page.getByRole('alert')).toContainText('Basket could not be saved');
});
