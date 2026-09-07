import { test, expect } from '@playwright/test';
import { setupPlanner, slot, monday, meal } from './helpers/planner';
test('two weeks, chronological meal sections, calendar navigation and persisted legacy entries', async ({
  page,
}) => {
  await setupPlanner(page, [meal('source', monday)]);
  await expect(page.locator('[data-date]')).toHaveCount(14);
  await expect(slot(page).locator('[data-plan-open]')).toHaveText('Pasta');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.locator('[data-date]')).toHaveCount(7);
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.locator('[data-date]').first()).toHaveAttribute('data-date', '2026-09-14');
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(slot(page).locator('[data-plan-open]')).toHaveText('Pasta');
  await page.reload();
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: 'Meal Plan', exact: true }).click();
  await expect(slot(page).locator('[data-plan-open]')).toHaveText('Pasta');
});
test('slot placement creates a flexible meal; editing and removal persist without a recipe', async ({
  page,
}) => {
  const model = await setupPlanner(page, []);
  await slot(page).getByRole('button').click();
  await page.getByLabel('Entry type').selectOption('eating-out');
  await page.getByLabel('Title', { exact: true }).fill('Dinner with friends');
  await page.getByLabel('Portions for this meal').fill('2');
  await page.getByLabel('Estimated kcal/portion (optional)').fill('650');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(slot(page).locator('[data-plan-open]')).toHaveText('Dinner with friends');
  expect(model.state().mealPlans[0]).toMatchObject({
    entryType: 'eating-out',
    kcalPerPortion: 650,
    recipeId: '',
  });
  await slot(page).locator('[data-plan-open]').click();
  await page.getByLabel('Notes', { exact: true }).fill('Meet at 7');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(model.state().mealPlans[0].notes).toBe('Meet at 7');
  await slot(page)
    .getByRole('button', { name: /^Remove Dinner/ })
    .click();
  await expect(slot(page).locator('[data-plan-open]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(slot(page).locator('[data-plan-open]')).toHaveText('Dinner with friends');
});
test('slot recipe placement and cancellation use the shared editor without side effects', async ({
  page,
}) => {
  const model = await setupPlanner(page, []);
  await slot(page).getByRole('button').click();
  await page.getByRole('combobox', { name: 'Recipe', exact: true }).selectOption('pasta');
  await page.getByRole('button', { name: 'Back to meal planner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meal Planner', exact: true })).toBeVisible();
  expect(model.writes).toHaveLength(0);
  await slot(page).getByRole('button').click();
  await page.getByRole('combobox', { name: 'Recipe', exact: true }).selectOption('pasta');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(slot(page).locator('[data-plan-open]')).toHaveText('Pasta');
});
test('an uncertain save retries its durable operation once and never duplicates the meal', async ({
  page,
}) => {
  const model = await setupPlanner(page, []);
  model.options.loseResponse = true;
  await page.getByRole('button', { name: 'Place Pasta', exact: true }).click();
  await slot(page).getByRole('button').click();
  await expect(page.getByRole('button', { name: 'Retry pending save' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry pending save' }).click();
  await expect(slot(page).locator('[data-plan-open]')).toHaveCount(1);
  expect(model.state().mealPlans).toHaveLength(1);
  expect(model.writes[1].operationId).toBe(model.writes[0].operationId);
});
test('pastel X has a descriptive label and a full hit target without an overflow menu', async ({
  page,
}) => {
  await setupPlanner(page, [meal('source', monday)]);
  const remove = slot(page).getByRole('button', { name: `Remove Pasta from ${monday} lunch` });
  await expect(remove).toHaveCSS('background-color', 'rgb(255, 229, 229)');
  const box = (await remove.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await expect(slot(page).locator('summary')).toHaveCount(0);
});
