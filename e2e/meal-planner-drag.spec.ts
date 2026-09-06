import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page) {
  const writes: unknown[] = [];
  await page.route('https://mock-api.test/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/recipes')
      return route.fulfill({
        json: {
          recipes: Array.from({ length: 24 }, (_, index) => ({
            recipeId: `recipe-${index}`,
            name: `Recipe ${String(index).padStart(2, '0')}`,
            tags: ['Dinner'],
            portions: 2,
          })),
        },
      });
    if (path === '/meal-plans' && request.method() === 'POST') {
      const body = request.postDataJSON();
      writes.push(body);
      return route.fulfill({
        json: {
          mealPlan: {
            ...body,
            planId: `plan-${writes.length}`,
            createdAt: new Date().toISOString(),
          },
        },
      });
    }
    return route.fulfill({ json: { items: [], groups: [], locations: [], mealPlans: [] } });
  });
  await page.goto('/');
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Meal Plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next week' })).toBeEnabled();
  return writes;
}

test('mouse drag from a long library into the second week saves exactly once', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const writes = await setup(page);
  const recipe = page.getByRole('button', { name: 'Place Recipe 00', exact: true });
  const target = page
    .locator('[data-date]')
    .nth(8)
    .getByRole('button', { name: /Plan dinner/ });
  await recipe.dragTo(target);
  await expect(
    page.locator('[data-date]').nth(8).getByText('Recipe 00', { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
});

test('mouse press, move and release places a recipe without clicking a meal first', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const writes = await setup(page);
  const recipe = page.getByRole('button', { name: 'Place Recipe 00', exact: true });
  const target = page
    .locator('[data-date]')
    .nth(1)
    .getByRole('button', { name: /Plan lunch/ });
  const from = (await recipe.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(
    page.locator('[data-date]').nth(1).getByText('Recipe 00', { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
});

test('drag works when Chrome native dragging is cancelled and highlights the actual destination', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const writes = await setup(page);
  await page.evaluate(() =>
    document.addEventListener('dragstart', (event) => event.preventDefault()),
  );
  const source = page.getByRole('button', { name: 'Place Recipe 00', exact: true });
  const target = page
    .locator('[data-date]')
    .nth(1)
    .getByRole('button', { name: /Plan lunch/ });
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + 15, from.y + 15);
  await page.mouse.down();
  await page.mouse.move(to.x + 15, to.y + 15);
  await expect(page.getByTestId('recipe-drag-preview')).toHaveText('Recipe 00');
  await expect(target).toHaveAttribute('data-drag-over', 'true');
  await page.screenshot({ path: 'test-results/planner-active-drag.png' });
  await page.mouse.up();
  await expect(
    page.locator('[data-date]').nth(1).getByText('Recipe 00', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('recipe-drag-preview')).toHaveCount(0);
  expect(writes).toEqual([expect.objectContaining({ recipeId: 'recipe-0', mealType: 'lunch' })]);
});

test('scrolling a long library preserves the exact dragged recipe', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const writes = await setup(page);
  const source = page.getByRole('button', { name: 'Place Recipe 23', exact: true });
  const target = page
    .locator('[data-date]')
    .nth(1)
    .getByRole('button', { name: /Plan dinner/ });
  await source.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await source.dragTo(target);
  await expect(
    page.locator('[data-date]').nth(1).getByText('Recipe 23', { exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([
    expect.objectContaining({ recipeId: 'recipe-23', recipeName: 'Recipe 23', mealType: 'dinner' }),
  ]);
});

for (const cancellation of ['outside', 'escape', 'pointercancel']) {
  test(`${cancellation} cancels a drag without placing or selecting a recipe`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const writes = await setup(page);
    const source = page.getByRole('button', { name: 'Place Recipe 00', exact: true });
    const target = page
      .locator('[data-date]')
      .nth(1)
      .getByRole('button', { name: /Plan lunch/ });
    const from = (await source.boundingBox())!;
    await page.mouse.move(from.x + 15, from.y + 15);
    await page.mouse.down();
    await page.mouse.move(from.x + 70, from.y + 15);
    await expect(page.getByTestId('recipe-drag-preview')).toBeVisible();
    if (cancellation === 'escape') await page.keyboard.press('Escape');
    else if (cancellation === 'pointercancel')
      await source.dispatchEvent('pointercancel', { pointerId: 1 });
    else await page.mouse.move(700, 120);
    await page.mouse.up();
    await expect(page.getByTestId('recipe-drag-preview')).toHaveCount(0);
    await expect(source).toHaveAttribute('aria-pressed', 'false');
    await target.click();
    expect(writes).toHaveLength(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await source.click();
    await target.click();
    await expect(
      page.locator('[data-date]').nth(1).getByText('Recipe 00', { exact: true }),
    ).toBeVisible();
    expect(writes).toHaveLength(1);
  });
}

test('holding a drag near the window edge scrolls to the second week', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 600 });
  const writes = await setup(page);
  const source = page.getByRole('button', { name: 'Place Recipe 00', exact: true });
  await source.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const from = (await source.boundingBox())!;
  await page.mouse.move(from.x + 15, from.y + 15);
  await page.mouse.down();
  await page.mouse.move(800, 510, { steps: 10 });
  const target = page
    .locator('[data-date]')
    .nth(8)
    .getByRole('button', { name: /Plan dinner/ });
  await expect
    .poll(async () => {
      const bounds = (await target.boundingBox())!;
      return bounds.y + bounds.height;
    })
    .toBeLessThan(544);
  await page.mouse.move(800, 300);
  const to = (await target.boundingBox())!;
  await page.mouse.move(to.x + 15, to.y + 15, { steps: 10 });
  await expect(target).toHaveAttribute('data-drag-over', 'true');
  await page.mouse.up();
  await expect(
    page.locator('[data-date]').nth(8).getByText('Recipe 00', { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
});

test.describe('touch selection', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('swiping recipe buttons scrolls the library without placing a meal', async ({
    page,
    context,
  }) => {
    const writes = await setup(page);
    const source = page.getByRole('button', { name: 'Place Recipe 00', exact: true });
    const bounds = (await source.boundingBox())!;
    const session = await context.newCDPSession(page);
    const x = bounds.x + 50;
    const y = bounds.y + 20;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const distance of [25, 50, 80, 100]) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y - distance }],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect
      .poll(() => page.getByRole('complementary').evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(page.getByTestId('recipe-drag-preview')).toHaveCount(0);
    expect(writes).toHaveLength(0);
  });

  test('touch taps select and place a recipe without starting a drag', async ({ page }) => {
    const writes = await setup(page);
    const selected = page.getByRole('button', { name: 'Place Recipe 00', exact: true });
    await selected.tap();
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    const target = page
      .locator('[data-date]')
      .first()
      .getByRole('button', { name: /Plan lunch/ });
    await target.tap();
    await expect(
      page.locator('[data-date]').first().getByText('Recipe 00', { exact: true }),
    ).toBeVisible();
    expect(writes).toEqual([expect.objectContaining({ recipeId: 'recipe-0', mealType: 'lunch' })]);
  });
});
