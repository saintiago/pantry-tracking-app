import { test, expect } from '@playwright/test';
import { setupPlanner, pointerDrag, slot, monday, meal } from './helpers/planner';
for (const mealType of ['breakfast', 'lunch', 'dinner'])
  test(`direct mouse card drag adds to ${mealType} without opening details`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const model = await setupPlanner(page, []);
    await pointerDrag(
      page,
      page.locator('[data-recipe-open="pasta"]'),
      slot(page, monday, mealType),
    );
    await expect(slot(page, monday, mealType).locator('[data-plan-open]')).toHaveCount(1);
    expect(model.writes).toHaveLength(1);
    expect(model.state().mealPlans[0].mealType).toBe(mealType);
    await expect(page.getByRole('heading', { name: 'Meal Planner', exact: true })).toBeVisible();
  });
test('moves between dates and slots, adds to occupied meals, returns to library and undoes removal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const model = await setupPlanner(page, [meal('first', monday), meal('second', '2026-09-08')]);
  await pointerDrag(page, page.locator('[data-plan-open="first"]'), slot(page, '2026-09-08'));
  await expect(slot(page, '2026-09-08').locator('[data-plan-open]')).toHaveCount(2);
  expect(model.state().mealPlans.find((e) => e.planId === 'first')?.servings).toBe(2);
  await pointerDrag(
    page,
    page.locator('[data-plan-open="first"]'),
    slot(page, '2026-09-08', 'dinner'),
  );
  await expect(slot(page, '2026-09-08', 'dinner').locator('[data-plan-open]')).toHaveCount(1);
  await pointerDrag(
    page,
    page.locator('[data-plan-open="first"]'),
    page.getByRole('complementary'),
  );
  await expect(page.locator('[data-plan-open="first"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-plan-open="first"]')).toBeVisible();
  expect(model.state().mealPlans).toHaveLength(2);
});
for (const kind of ['escape', 'outside', 'original'])
  test(`${kind} drag cancellation leaves saved state unchanged`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const model = await setupPlanner(page, [meal('first', monday)]);
    const source = page.locator('[data-plan-open="first"]');
    const a = (await source.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2);
    if (kind === 'escape') await page.keyboard.press('Escape');
    if (kind === 'outside') await page.mouse.move(5, 5);
    await page.mouse.up();
    await expect(page.getByTestId('recipe-drag-preview')).toHaveCount(0);
    expect(model.writes).toHaveLength(0);
  });
test('scrolled library preserves recipe identity and edge scrolling remains active during a drag', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const model = await setupPlanner(page, [], 32);
  const source = page.locator('[data-recipe-open="recipe-25"]');
  await source.scrollIntoViewIfNeeded();
  await pointerDrag(page, source, slot(page, '2026-09-14'));
  await expect(slot(page, '2026-09-14').locator('[data-plan-open]')).toHaveText('Recipe 25');
  expect(model.state().mealPlans[0].recipeId).toBe('recipe-25');
});
for (const width of [320, 390])
  test(`touch hold drags a readable card at ${width}px while a swipe scrolls without scheduling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    const model = await setupPlanner(page, [], 18);
    await page.getByRole('button', { name: 'Recipe drawer' }).click();
    const source = page.locator('[data-recipe-open="apple"]');
    await source.scrollIntoViewIfNeeded();
    const a = (await source.boundingBox())!;
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: a.x + 30, y: a.y + a.height / 2 }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: a.x + 30, y: a.y + a.height / 2 - 40 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(model.writes).toHaveLength(0);
    await source.scrollIntoViewIfNeeded();
    const b = (await source.boundingBox())!;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: b.x + 20, y: b.y + b.height / 2 }],
    });
    await expect(page.getByTestId('recipe-drag-preview')).toBeVisible();
    const preview = (await page.getByTestId('recipe-drag-preview').boundingBox())!;
    expect(preview.x).toBeGreaterThanOrEqual(0);
    expect(preview.x + preview.width).toBeLessThanOrEqual(width + 1);
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(page.getByTestId('recipe-drag-preview')).toHaveCount(0);
    expect(model.writes).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });

test('touch press-and-hold schedules a card and exposes a visible return target for calendar dragging', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const model = await setupPlanner(page, []);
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Recipe drawer' }).click();
  const source = page.locator('[data-recipe-open="pasta"]');
  await source.scrollIntoViewIfNeeded();
  const a = (await source.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: a.x + 20, y: a.y + a.height / 2 }],
  });
  await expect(page.getByTestId('recipe-drag-preview')).toBeVisible();
  // Keep the drop point clear of the fixed mobile navigation on every platform.
  await slot(page).evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const b = (await slot(page).boundingBox())!;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(slot(page).locator('[data-plan-open]')).toHaveText('Pasta');
  expect(model.state().mealPlans).toHaveLength(1);
  const card = slot(page).locator('[data-plan-open]');
  await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const c = (await card.boundingBox())!;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: c.x + 20, y: c.y + c.height / 2 }],
  });
  await expect(page.getByText('Drop here to remove from plan', { exact: true })).toBeVisible();
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  expect(model.state().mealPlans).toHaveLength(1);
});
