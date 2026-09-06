import { test, expect, type Page } from '@playwright/test';

const recipes = [
  { recipeId: 'soup', name: 'Tomato soup', tags: ['dinner', 'vegetarian'], portions: 4 },
  { recipeId: 'toast', name: 'Avocado toast', tags: ['breakfast'], portions: 2 },
  { recipeId: 'legacy', name: 'Family recipe', portions: 3 },
];

async function setup(
  page: Page,
  options: { empty?: boolean; recipesFail?: boolean; saveFail?: boolean; bulkFail?: boolean } = {},
) {
  await page.clock.setFixedTime(new Date('2026-09-04T12:00:00Z'));
  const plans = [
    {
      planId: 'past',
      date: '2026-09-03',
      mealType: 'dinner',
      recipeId: 'soup',
      recipeName: 'Yesterday soup',
      servings: 4,
      createdAt: '2026-09-01',
    },
    {
      planId: 'today',
      date: '2026-09-04',
      mealType: 'lunch',
      recipeId: 'soup',
      recipeName: 'Today soup',
      servings: 4,
      createdAt: '2026-09-01',
    },
    {
      planId: 'future',
      date: '2026-10-20',
      mealType: 'dinner',
      recipeId: 'soup',
      recipeName: 'Future soup',
      servings: 4,
      createdAt: '2026-09-01',
    },
  ];
  const requests: { method: string; body: Record<string, unknown> }[] = [];
  await page.route('https://mock-api.test/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === '/inventory') return json({ items: [], groups: [] });
    if (url.pathname === '/locations') return json({ locations: [] });
    if (url.pathname === '/auth/verify') return json({ valid: true });
    if (url.pathname === '/recipes') {
      if (options.recipesFail) return json({ message: 'Recipes unavailable' }, 500);
      return json({ recipes: options.empty ? [] : recipes });
    }
    if (url.pathname === '/meal-plans') {
      if (req.method() === 'GET')
        return json({
          mealPlans: plans.filter(
            (p) =>
              p.date >= url.searchParams.get('startDate')! &&
              p.date <= url.searchParams.get('endDate')!,
          ),
        });
      const body = req.postDataJSON();
      requests.push({ method: req.method(), body });
      if (req.method() === 'POST') {
        if (options.saveFail) return json({ message: 'Could not save meal' }, 500);
        const plan = { ...body, planId: `new-${plans.length}`, createdAt: '2026-09-04' };
        plans.push(plan);
        return json({ mealPlan: plan }, 201);
      }
      if (req.method() === 'PUT') {
        if (options.bulkFail) return json({ message: 'Could not update meals' }, 500);
        const selected = plans.filter((p) => p.date >= body.startDate);
        selected.forEach((p) => {
          p.servings = body.servings;
        });
        return json({ updatedCount: selected.length });
      }
    }
    return json({});
  });
  await page.goto('/');
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Meal Plan', exact: true }).click();
  await expect(page.locator('[data-date]')).toHaveCount(14);
  return { plans, requests };
}

test('recipes appear once alphabetically with category filters to the left of two complete weeks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  const library = page.getByRole('complementary', { name: 'Recipe library' });
  await expect(library.locator('[data-recipe-open]')).toHaveText([
    'Avocado toast',
    'Family recipe',
    'Tomato soup',
  ]);
  await library.getByRole('button', { name: 'dinner', exact: true }).click();
  await library.getByRole('button', { name: 'vegetarian', exact: true }).click();
  await expect(library.locator('[data-recipe-open]')).toHaveText(['Tomato soup']);
  await library.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('[data-date]').first()).toHaveAttribute('data-date', '2026-08-31');
  await expect(page.locator('[data-date]').last()).toHaveAttribute('data-date', '2026-09-13');
  const left = (await library.boundingBox())!;
  const calendar = (await page.locator('[data-date]').first().boundingBox())!;
  expect(left.x + left.width).toBeLessThanOrEqual(calendar.x);
  await page.screenshot({ path: 'test-results/meal-planner-desktop.png', fullPage: true });
});

test('real drag and drop saves the recipe in the selected second-week meal slot', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { requests } = await setup(page);
  const source = page
    .getByRole('complementary')
    .getByRole('button', { name: 'Place Avocado toast' });
  await source.dragTo(page.getByRole('button', { name: 'Plan dinner on 2026-09-08' }));
  const day = page.locator('[data-date="2026-09-08"]');
  await expect(day.getByText('Avocado toast', { exact: true })).toBeVisible();
  await expect(day.getByText('2 servings')).toBeVisible();
  expect(requests).toEqual([
    {
      method: 'POST',
      body: {
        recipeId: 'toast',
        recipeName: 'Avocado toast',
        date: '2026-09-08',
        mealType: 'dinner',
        servings: 2,
      },
    },
  ]);
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await expect(day.getByText('Avocado toast', { exact: true })).toBeVisible();
});

test('keyboard selection and calendar activation add meals without dragging', async ({ page }) => {
  await setup(page);
  const source = page
    .getByRole('complementary')
    .getByRole('button', { name: 'Place Family recipe' });
  await source.focus();
  await page.keyboard.press('Enter');
  await expect(source).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Plan breakfast on 2026-09-05' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-date="2026-09-05"]').getByText('Family recipe')).toBeVisible();
  await expect(source).toHaveAttribute('aria-pressed', 'false');
});

test('bulk servings persist for today and all future meals while past meals and source recipes stay unchanged', async ({
  page,
}) => {
  const { plans, requests } = await setup(page);
  await page.getByLabel('Servings', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Update future meals' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Updated' })).toHaveText(
    'Updated 2 planned meals to 2 servings.',
  );
  expect(requests).toEqual([{ method: 'PUT', body: { startDate: '2026-09-04', servings: 2 } }]);
  expect(plans.map((p) => p.servings)).toEqual([4, 2, 2]);
  expect(recipes[0].portions).toBe(4);
  await expect(page.locator('[data-date="2026-09-03"]').getByText('4 servings')).toBeVisible();
  await expect(page.locator('[data-date="2026-09-04"]').getByText('2 servings')).toBeVisible();
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await page.getByRole('button', { name: 'Previous week', exact: true }).click();
  await expect(page.locator('[data-date="2026-09-04"]').getByText('2 servings')).toBeVisible();
});

test('invalid servings do not submit, and failed updates show a retryable error', async ({
  page,
}) => {
  const options = { bulkFail: true };
  const { requests } = await setup(page, options);
  for (const value of ['', '0', '-1', '1.5']) {
    await page.getByLabel('Servings', { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Update future meals' }).click();
  }
  expect(requests).toHaveLength(0);
  await page.getByLabel('Servings', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Update future meals' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not update meals');
  await expect(page.locator('[data-date="2026-09-04"]').getByText('4 servings')).toBeVisible();
  options.bulkFail = false;
  await page.getByRole('button', { name: 'Update future meals' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Updated' })).toContainText('3 servings');
});

test('failed meal creation retains selection for retry and does not add a card', async ({
  page,
}) => {
  const options = { saveFail: true };
  await setup(page, options);
  const source = page
    .getByRole('complementary')
    .getByRole('button', { name: 'Place Family recipe' });
  await source.click();
  await page.getByRole('button', { name: 'Plan lunch on 2026-09-07' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save meal');
  await expect(source).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-date="2026-09-07"]').getByText('Family recipe')).toHaveCount(0);
  options.saveFail = false;
  await page.getByRole('button', { name: 'Plan lunch on 2026-09-07' }).click();
  await expect(page.locator('[data-date="2026-09-07"]').getByText('Family recipe')).toBeVisible();
});

test('recipe loading failures can be retried and empty libraries are explained', async ({
  page,
}) => {
  const options = { recipesFail: true, empty: true };
  await setup(page, options);
  await expect(page.getByRole('alert')).toContainText('Recipes unavailable');
  options.recipesFail = false;
  await page.getByRole('button', { name: 'Retry recipes' }).click();
  await expect(page.getByText('No recipes yet. Add recipes in the Recipes tab.')).toBeVisible();
});

test('mobile planner supports selection and keeps the page within the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page
    .getByRole('complementary')
    .getByRole('button', { name: 'Place Avocado toast' })
    .click();
  await page.getByRole('button', { name: 'Plan lunch on 2026-09-12' }).click();
  await expect(page.locator('[data-date="2026-09-12"]').getByText('Avocado toast')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/meal-planner-mobile.png', fullPage: true });
});
