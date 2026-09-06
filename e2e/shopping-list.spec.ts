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
      if (body.name === 'Rice') {
        items[0].quantity += body.quantity;
        groups[0].totalQuantity += body.quantity;
        groups[0].isLowStock = groups[0].totalQuantity <= 1;
      }
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

test('aggregates servings, paginated stock, recipe references and independent low-stock reminders', async ({
  page,
}) => {
  const fixture = await setup(page);
  await expect(rice(page)).toContainText('Buy 300 g');
  await expect(rice(page)).toContainText('Needed 600 g · In inventory for these meals 300 g');
  await expect(rice(page)).toContainText('Vegetable curry · Tue, Sep 8 · dinner');
  await expect(rice(page)).toContainText('Tomato salad · Wed, Sep 9 · lunch');
  await expect(meals(page)).toContainText('Quantity to check');
  await expect(low(page)).toContainText('Dish soap');
  expect(fixture.pages()).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Vegetable curry', exact: true }).click();
  await expect(rice(page)).toContainText('Buy 100 g');
  await expect(meals(page)).not.toContainText('Tomatoes');
  await expect(low(page)).toContainText('Dish soap');
  await page.getByRole('button', { name: 'Wed, Sep 9', exact: true }).click();
  await expect(meals(page)).toContainText('No meals planned for these filters.');
  await expect(low(page)).toContainText('Dish soap');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rice(page)).toContainText('Buy 300 g');
});

test('week navigation, multi-select days/recipes, past days and covered ingredients', async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel('Include past days').check();
  await expect(rice(page)).toContainText('Buy 700 g');
  await page.getByLabel('Include past days').uncheck();
  await page.getByRole('button', { name: 'Wed, Sep 9', exact: true }).click();
  await expect(rice(page)).toHaveCount(0);
  await page.getByLabel('Show ingredients already in stock').check();
  await expect(rice(page)).toContainText('In stock');
  await page.getByRole('button', { name: 'Tue, Sep 8', exact: true }).click();
  await page.getByRole('button', { name: 'Vegetable curry', exact: true }).click();
  await page.getByRole('button', { name: 'Tomato salad', exact: true }).click();
  await expect(rice(page)).toContainText('Buy 300 g');
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await expect(rice(page)).toContainText('Buy 100 g');
  await page.getByRole('button', { name: 'Previous week', exact: true }).click();
  await expect(rice(page)).toContainText('Buy 300 g');
  await page.getByRole('button', { name: 'Both weeks' }).click();
  await expect(rice(page)).toContainText('Buy 700 g');
  await page.getByRole('button', { name: 'Next week only' }).click();
  await expect(rice(page)).toContainText('Buy 100 g');
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await page.getByLabel('Week of').fill('2026-10-01');
  await expect(meals(page)).toContainText('No meals planned');
});

test('linked checkboxes, extras, search, reload persistence and increased demand review', async ({
  page,
}) => {
  const { plans, login } = await setup(page);
  await low(page).getByLabel('Extra to buy: Rice').fill('200');
  await expect(low(page)).toContainText('Total to buy: 500 g');
  await expect(rice(page)).toContainText('Buy 500 g');
  await rice(page).getByRole('checkbox').click();
  await meals(page).getByText('In basket (1)', { exact: true }).click();
  await low(page).getByText('In basket (1)', { exact: true }).click();
  await expect(low(page).getByLabel('In basket: Rice')).toBeChecked();
  await page.getByLabel('Search ingredients').fill('soap');
  await expect(meals(page)).toContainText('No ingredients match your search.');
  await expect(low(page)).not.toContainText('Rice');
  await page.getByLabel('Search ingredients').fill('');
  await page.reload();
  await login();
  await meals(page).getByText('In basket (1)', { exact: true }).click();
  await expect(rice(page).getByRole('checkbox')).toBeChecked();
  plans[1].servings = 8;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(rice(page)).toContainText('Needs review');
  await expect(rice(page).getByRole('checkbox')).not.toBeChecked();
  await rice(page).getByRole('checkbox').click();
  await meals(page).getByText('In basket (1)', { exact: true }).click();
  await rice(page).getByRole('checkbox').click();
  await expect(rice(page).getByRole('checkbox')).not.toBeChecked();
});

test('purchase page validates, retries locations and saving, preserves stock unit and refreshes inventory', async ({
  page,
}) => {
  const options = { purchaseFail: true, locationsFail: false };
  const { purchases } = await setup(page, options);
  await rice(page).getByRole('checkbox').click();
  await meals(page).getByText('In basket (1)', { exact: true }).click();
  options.locationsFail = true;
  await rice(page).getByRole('button', { name: 'Add purchases to inventory' }).click();
  await expect(page.getByRole('heading', { name: 'Add purchases to inventory' })).toBeVisible();
  await expect(page.getByLabel('Actual quantity (kg)')).toHaveValue('0.3');
  await expect(page.getByRole('alert')).toContainText('Could not load storage locations');
  options.locationsFail = false;
  await page.getByRole('button', { name: 'Retry locations' }).click();
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  expect(purchases).toHaveLength(0);
  await page.getByLabel('Actual quantity (kg)').fill('1');
  await page.getByLabel('Category', { exact: true }).fill('Grains');
  await page.getByLabel('Storage location').selectOption('pantry');
  await page.getByLabel('Expiration date').fill('2027-01-01');
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save purchase');
  options.purchaseFail = false;
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Purchase added' })).toBeVisible();
  expect(purchases[1]).toEqual({
    name: 'Rice',
    category: 'Grains',
    unit: 'kg',
    quantity: 1,
    locationId: 'pantry',
    expirationDate: '2027-01-01',
  });
  await page.getByRole('button', { name: 'Back to shopping list' }).click();
  await expect(rice(page)).toHaveCount(0);
  await expect(low(page)).not.toContainText('Rice');
});

test('failed loading retries, empty lists and cancellation do not mutate stock', async ({
  page,
}) => {
  const options = { fail: true, empty: false };
  const { purchases } = await setup(page, options);
  await expect(page.getByRole('alert')).toContainText('Recipes unavailable');
  options.fail = false;
  await page.getByRole('button', { name: 'Retry shopping list' }).click();
  await rice(page).getByRole('checkbox').click();
  await meals(page).getByText('In basket (1)', { exact: true }).click();
  await rice(page).getByRole('button', { name: 'Add purchases to inventory' }).click();
  await page.getByRole('button', { name: 'Back to shopping list' }).click();
  expect(purchases).toHaveLength(0);
  options.empty = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(meals(page)).toContainText('No meals planned');
  await expect(low(page)).toContainText('No low-stock items.');
});

test('desktop and mobile layout fit the viewport and support keyboard shopping', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  await page.screenshot({ path: 'test-results/shopping-list-desktop.png', fullPage: true });
  await page.getByText('Day and recipe filters', { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await rice(page).getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  await expect(meals(page).getByText('In basket (1)', { exact: true })).toBeVisible();
  await low(page).getByLabel('Quantity to buy: Dish soap').fill('2');
  await expect(low(page)).toContainText('Total to buy: 2 bottle');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/shopping-list-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('focus refresh updates meals and a failed refresh keeps the old list read-only', async ({
  page,
}) => {
  const options = { fail: false };
  const { plans } = await setup(page, options);
  plans[1].servings = 8;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(rice(page)).toContainText('Buy 700 g');
  options.fail = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Showing the last loaded list');
  await expect(rice(page)).toContainText('Buy 700 g');
  await expect(rice(page).getByRole('checkbox')).toBeDisabled();
  options.fail = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(rice(page).getByRole('checkbox')).toBeEnabled();
});

test('unavailable device storage reports the problem but keeps this visit usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('pantry-shopping-v1:')) throw new Error('Storage unavailable');
      return original.call(this, key, value);
    };
  });
  await setup(page);
  await rice(page).getByRole('checkbox').click();
  await expect(page.getByRole('alert')).toContainText('Basket could not be saved');
  await meals(page).getByText('In basket (1)', { exact: true }).click();
  await expect(rice(page).getByRole('checkbox')).toBeChecked();
});

test('missing planned recipes are explained without claiming that everything is stocked', async ({
  page,
}) => {
  const { recipes } = await setup(page);
  recipes.splice(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('Recipe unavailable');
  await expect(meals(page)).toContainText('Some planned recipes could not be calculated');
  await expect(meals(page)).not.toContainText('Everything needed is in stock');
  await expect(low(page)).toContainText('Dish soap');
});
