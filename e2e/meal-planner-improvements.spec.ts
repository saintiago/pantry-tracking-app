import { test, expect } from '@playwright/test';
import { setupPlanner, slot, monday, meal } from './helpers/planner';
test('batch yield and linked leftovers persist, shopping counts once, and source removal resolves dependents', async ({
  page,
}) => {
  const model = await setupPlanner(page, [meal('source', monday)]);
  await page.locator('[data-plan-open="source"]').click();
  await page.getByRole('button', { name: 'Edit / move meal' }).click();
  await page.getByLabel('Plan batch cooking').check();
  await page.getByLabel('Total portions to prepare').fill('6');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(slot(page).locator('[data-plan-open]')).toBeVisible();
  await slot(page, '2026-09-08').getByRole('button').click();
  await page.getByLabel('Entry type').selectOption('leftovers');
  await page
    .getByRole('combobox', { name: 'Source batch', exact: true })
    .selectOption(model.state().batches[0].batchId);
  await page.getByLabel('Portions for this meal').fill('2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(slot(page, '2026-09-08').locator('[data-plan-open]')).toHaveText('Pasta');
  await slot(page)
    .getByRole('button', { name: /^Remove Pasta/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'Resolve dependent leftovers' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove cooking and dependent entries' }).click();
  await expect(page.locator('[data-plan-open]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-plan-open]')).toHaveCount(2);
  expect(model.state().batches).toHaveLength(1);
});
test('prepared food confirmation, allocation and eating distinguish reserved and consumed portions', async ({
  page,
}) => {
  const model = await setupPlanner(page, [meal('source', monday)]);
  await page.locator('[data-plan-open="source"]').click();
  await page.getByRole('button', { name: 'Edit / move meal' }).click();
  await page.getByLabel('Plan batch cooking').check();
  await page.getByLabel('Total portions to prepare').fill('6');
  await page.getByLabel('Confirm batch as cooked').check();
  await page.getByLabel('Storage (for example, fridge or freezer)').fill('Freezer');
  await page.getByLabel('Mark these portions eaten').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(slot(page).locator('[data-plan-open]')).toBeVisible();
  expect(model.state().batches[0]).toMatchObject({
    actualYield: 6,
    consumed: 2,
    status: 'prepared',
  });
  await page.locator('summary').filter({ hasText: 'Prepared batches' }).click();
  await expect(
    page.getByText('Available: 4. Reserved: 0. Consumed: 2. Discarded: 0.'),
  ).toBeVisible();
});
test('copy week previews occupied meals, persists fresh IDs and reusable favorite weeks', async ({
  page,
}) => {
  const model = await setupPlanner(page, [meal('source', monday)]);
  await page.getByText('Copy plans / Favorite weeks', { exact: true }).click();
  await page.getByLabel('Destination start date').fill(monday);
  await page.getByRole('button', { name: 'Preview copy' }).click();
  await expect(page.getByLabel('Copy preview')).toContainText('Adds to occupied meal');
  await page.getByRole('button', { name: 'Apply copy' }).click();
  await expect(slot(page).locator('[data-plan-open]')).toHaveCount(2);
  expect(new Set(model.state().mealPlans.map((e) => e.planId)).size).toBe(2);
  await page.getByLabel('Favorite week name').fill('Easy week');
  await page.getByRole('button', { name: 'Save favorite week' }).click();
  await expect.poll(() => model.state().favorites.length).toBe(1);
  await page.reload();
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: 'Meal Plan', exact: true }).click();
  await page.getByText('Copy plans / Favorite weeks', { exact: true }).click();
  await page.getByLabel('Copy from').selectOption(model.state().favorites[0].favoriteId);
  await page.getByLabel('Destination start date').fill('2026-09-14');
  await page.getByRole('button', { name: 'Preview copy' }).click();
  await page.getByRole('button', { name: 'Apply copy' }).click();
  await expect(slot(page, '2026-09-14').locator('[data-plan-open]')).toHaveCount(2);
});
test('calorie estimates show per-person, all-portions and unknown subtotals', async ({ page }) => {
  await setupPlanner(page, [
    { ...meal('first', monday), servings: 2 },
    { ...meal('note', monday), entryType: 'custom', recipeId: '', recipeName: 'Unknown snack' },
  ]);
  const day = page.locator(`[data-date="${monday}"]`);
  await expect(day).toContainText('kcal per person: 400');
  await expect(day).not.toContainText('All planned portions');
  await expect(day).toContainText('Incomplete: 1 entries unknown');
});
test('fewest groceries ranks independently and shows stock loading failures honestly', async ({
  page,
}) => {
  const model = await setupPlanner(page, []);
  model.options.inventoryFail = true;
  await page.getByLabel('Sort recipes').selectOption('groceries');
  await expect(page.getByRole('alert')).toContainText('Stock load failed');
  await expect(page.getByRole('complementary')).not.toContainText('Uses what you have');
  model.options.inventoryFail = false;
  await page.getByRole('button', { name: 'Refresh inventory' }).click();
  await expect(page.getByRole('complementary').getByText('1 ingredients to buy')).toHaveCount(2);
  expect(model.writes).toHaveLength(0);
});

test('recipe calorie input derives one stored total, retains it on yield edits and clears to unknown', async ({
  page,
}) => {
  const model = await setupPlanner(page, []);
  await page.locator('[data-recipe-open="pasta"]').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('combobox', { name: 'Calorie input basis' }).selectOption('portion');
  await expect(page.getByLabel('Calories (kcal)', { exact: true })).toHaveValue('400');
  await page.getByLabel('Calories (kcal)', { exact: true }).fill('450');
  await page.getByRole('button', { name: 'Increase portions', exact: true }).click();
  await expect(page.getByLabel('Calories (kcal)', { exact: true })).toHaveValue('360');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pasta', exact: true })).toBeVisible();
  expect(model.recipes[0]).toMatchObject({ totalKcal: 1800, portions: 5 });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Calories (kcal)', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByText('Calories unknown', { exact: false })).toBeVisible();
});
for (const [language, plannerLabel, copyLabel, drawer] of [
  ['Español', 'Planificador de comidas', 'Copiar planes / Semanas favoritas', 'Panel de recetas'],
  ['Italiano', 'Pianificazione pasti', 'Copia piani / Settimane preferite', 'Pannello ricette'],
])
  test(`${language} expanded planner controls remain usable at 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 850 });
    await setupPlanner(page, []);
    await page.locator('header button[aria-controls="language-options"]').click();
    await page.getByRole('button', { name: new RegExp(language) }).click();
    await expect(page.getByRole('button', { name: new RegExp(language) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.locator('#language-options').press('Escape');
    await expect(page.getByRole('heading', { name: plannerLabel, exact: true })).toBeVisible();
    await expect(page.getByText(copyLabel, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: drawer, exact: true }).click();
    await expect(page.locator('[data-recipe-open="pasta"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  });
