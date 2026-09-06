import { test, expect, type Page } from '@playwright/test';

test('translated planner keeps canonical drag values and localized return controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { writes } = await setup(page);
  await page.locator('header button[aria-controls="language-options"]').click();
  await page.getByRole('button', { name: /Español/ }).click();
  await page.locator('#language-options').press('Escape');
  await page
    .getByRole('button', { name: 'Colocar Pasta', exact: true })
    .dragTo(page.locator('[data-meal-date="2026-09-07"][data-meal-type="lunch"]'));
  await expect(page.locator('[data-date="2026-09-07"] [data-plan-open]')).toBeVisible();
  expect(writes.at(-1)?.body.mealType).toBe('lunch');
  await page.locator('header button[aria-controls="language-options"]').click();
  await page.getByRole('button', { name: /Italiano/ }).click();
  await page.locator('#language-options').press('Escape');
  await page.getByRole('complementary').getByRole('button', { name: 'Pasta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Torna al piano pasti' })).toBeVisible();
});

async function setup(page: Page) {
  await page.clock.setFixedTime(new Date('2026-09-07T12:00:00Z'));
  const recipes = [
    {
      recipeId: 'pasta',
      name: 'Pasta',
      tags: ['dinner', 'vegetarian'],
      portions: 2,
      ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
      instructions: ['Boil water', 'Cook pasta', 'Serve'],
    },
    {
      recipeId: 'apple',
      name: 'Apple bowl',
      tags: ['breakfast'],
      portions: 1,
      ingredients: [{ name: 'Apple', quantity: 1, unit: 'unit' }],
      instructions: ['Slice apple'],
    },
  ];
  let plans = [
    {
      planId: 'planned',
      recipeId: 'pasta',
      recipeName: 'Pasta',
      date: '2026-09-15',
      mealType: 'lunch',
      servings: 4,
      createdAt: '2026-09-07',
      updatedAt: '2026-09-07',
    },
  ];
  const writes: { path: string; method: string; body: Record<string, unknown> }[] = [];
  const options = { fail: false, detailFail: false };
  await page.route('https://mock-api.test/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
    if (url.pathname === '/recipes') return json({ recipes });
    if (url.pathname === '/recipes/tags')
      return json({ tags: ['breakfast', 'dinner', 'vegetarian'] });
    if (url.pathname.startsWith('/recipes/')) {
      if (options.detailFail) return json({ message: 'Recipe unavailable' }, 500);
      return json({
        recipe: recipes.find((r) => url.pathname.endsWith(r.recipeId)),
        ingredientAvailability: [
          { name: 'Pasta', unit: 'g', required: 200, available: 0, status: 'missing' },
        ],
        missingCount: 1,
      });
    }
    if (url.pathname === '/meal-plans' && req.method() === 'GET')
      return json({
        mealPlans: plans.filter(
          (p) =>
            p.date >= url.searchParams.get('startDate')! &&
            p.date <= url.searchParams.get('endDate')!,
        ),
      });
    if (url.pathname.startsWith('/meal-plans') && req.method() !== 'GET') {
      const body = req.postDataJSON() ?? {};
      writes.push({ path: url.pathname, method: req.method(), body });
      if (options.fail) return json({ message: 'Save failed' }, 500);
      if (req.method() === 'PUT') {
        plans = plans.map((p) => ({ ...p, ...body }));
        return json({ mealPlan: plans[0] });
      }
      if (req.method() === 'DELETE') {
        plans = [];
        return json({});
      }
      const plan = { ...body, planId: 'new', createdAt: '2026-09-07' };
      plans.push(plan);
      return json({ mealPlan: plan }, 201);
    }
    return json({ items: [], groups: [], locations: [] });
  });
  await page.goto('/');
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: 'Meal Plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next week', exact: true })).toBeEnabled();
  return { writes, recipes, options };
}

test('library filters are a union without duplicates and detail returns to search, view and focus', async ({
  page,
}) => {
  const { writes } = await setup(page);
  const library = page.getByRole('complementary');
  await expect(library.locator('[data-recipe-open]')).toHaveText(['Apple bowl', 'Pasta']);
  await library.getByRole('button', { name: 'dinner', exact: true }).click();
  await library.getByRole('button', { name: 'vegetarian', exact: true }).click();
  await expect(library.locator('[data-recipe-open]')).toHaveText(['Pasta']);
  await expect(library.getByRole('button', { name: 'dinner', exact: true })).toHaveCSS(
    'background-color',
    'rgb(216, 243, 220)',
  );
  await library.getByRole('searchbox').fill('pas');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await library.getByRole('button', { name: 'Pasta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pasta', exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.goBack();
  await expect(library.getByRole('searchbox')).toHaveValue('pas');
  await expect(library.getByRole('button', { name: 'Pasta', exact: true })).toBeFocused();
  await expect(page.locator('[data-date]')).toHaveCount(7);
  await expect(page.locator('[data-date]').first()).toHaveAttribute('data-date', '2026-09-14');
});

test('planned servings save only the assignment, cooking returns to exact day and resumes', async ({
  page,
}) => {
  const { writes, recipes, options } = await setup(page);
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByLabel('Selected day').selectOption('2026-09-15');
  await page.locator('[data-plan-open="planned"]').click();
  await expect(page.getByLabel('Planned meal')).toContainText('2026-09-15 · lunch · 4 servings');
  await expect(page.getByText('400 grams', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Increase portions' }).click();
  options.fail = true;
  await page.getByRole('button', { name: 'Save servings for this meal' }).click();
  await expect(page.getByRole('alert')).toContainText('Save failed');
  options.fail = false;
  await page.getByRole('button', { name: 'Save servings for this meal' }).click();
  await expect(page.getByLabel('Planned meal')).toContainText('5 servings');
  expect(writes.at(-1)).toEqual({
    path: '/meal-plans/planned',
    method: 'PUT',
    body: { servings: 5 },
  });
  expect(recipes[0].portions).toBe(2);
  await page.getByTestId('cook-button').click();
  await expect(page.getByText('Boil water', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Next step/i }).click();
  await expect(page.getByText('Cook pasta', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Leave cooking mode' }).click();
  await expect(page.locator('[data-plan-open="planned"]')).toBeFocused();
  await expect(page.getByLabel('Selected day')).toHaveValue('2026-09-15');
  await page.getByRole('button', { name: 'Return to cooking', exact: true }).click();
  await expect(page.getByText('Cook pasta', { exact: true })).toBeVisible();
});

test('move retains the original on failure, persists a new date, and remove is explicit', async ({
  page,
}) => {
  const { writes, options } = await setup(page);
  await page.getByLabel('Meal actions for Pasta').click();
  await page.getByRole('button', { name: 'Move to…', exact: true }).click();
  await page.getByLabel('Date', { exact: true }).fill('2026-09-16');
  await page.getByLabel('Meal', { exact: true }).selectOption('dinner');
  options.fail = true;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Save failed');
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-09-16');
  options.fail = false;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('[data-date="2026-09-16"] [data-plan-open]')).toBeVisible();
  expect(writes.at(-1)?.body).toEqual({ date: '2026-09-16', mealType: 'dinner' });
  await page.getByLabel('Meal actions for Pasta').click();
  await page.getByRole('button', { name: 'Remove assignment' }).click();
  await expect(page.locator('[data-plan-open]')).toHaveCount(0);
});

test('mobile palette, slot add, failed detail return and selected-day shopping', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { options } = await setup(page);
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  const lunch = page.locator('[data-meal-type="lunch"]');
  await expect(lunch).toContainText('🍝');
  await expect(lunch).toHaveCSS('background-color', 'rgb(244, 209, 193)');
  await expect(page.locator('[data-meal-type="breakfast"]')).toHaveCSS(
    'background-color',
    'rgb(255, 242, 204)',
  );
  await expect(page.locator('[data-meal-type="dinner"]')).toHaveCSS(
    'background-color',
    'rgb(222, 227, 245)',
  );
  await lunch.getByRole('button').click();
  await expect(page.getByRole('dialog').getByLabel('Meal', { exact: true })).toHaveValue('lunch');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  options.detailFail = true;
  await page.getByRole('complementary').getByRole('button', { name: 'Pasta', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Recipe unavailable');
  await page.getByRole('button', { name: 'Back to meal planner' }).click();
  await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Selected day').selectOption('2026-09-15');
  await page.getByRole('button', { name: 'Shop for these meals' }).click();
  await expect(page.getByRole('heading', { name: 'Shopping List', exact: true })).toBeVisible();
});
