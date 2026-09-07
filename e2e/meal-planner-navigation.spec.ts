import { test, expect } from '@playwright/test';
import { setupPlanner, slot, monday } from './helpers/planner';
test('library category union, search, view and focus survive shared recipe detail', async ({
  page,
}) => {
  await setupPlanner(page);
  const library = page.getByRole('complementary');
  await expect(library.locator('[data-recipe-open]')).toHaveText(['Apple bowl', 'Pasta']);
  await library.getByRole('button', { name: 'dinner', exact: true }).click();
  await library.getByRole('button', { name: 'vegetarian', exact: true }).click();
  await expect(library.locator('[data-recipe-open]')).toHaveText(['Pasta']);
  await library.getByRole('searchbox').fill('pas');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await library.getByRole('button', { name: 'Pasta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pasta', exact: true })).toBeVisible();
  await page.goBack();
  await expect(library.getByRole('searchbox')).toHaveValue('pas');
  await expect(library.getByRole('button', { name: 'Pasta', exact: true })).toBeFocused();
  await expect(page.locator('[data-date]')).toHaveCount(7);
  await expect(page.locator('[data-date]').first()).toHaveAttribute('data-date', '2026-09-14');
});
test('planned servings and cooking retain selected day and update only the assignment', async ({
  page,
}) => {
  const model = await setupPlanner(page);
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByLabel('Selected day').selectOption('2026-09-15');
  await page.locator('[data-plan-open="planned"]').click();
  await expect(page.getByLabel('Planned meal')).toContainText('2 servings');
  await page.getByRole('button', { name: 'Increase portions' }).click();
  await page.getByRole('button', { name: 'Save servings for this meal' }).click();
  expect(model.state().mealPlans[0].servings).toBe(3);
  expect(model.recipes[0].portions).toBe(4);
  await page.getByRole('button', { name: '🍳 Cook', exact: true }).click();
  await expect(page.getByText('Boil water', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Leave cooking mode' }).click();
  await expect(page.getByRole('heading', { name: 'Meal Planner', exact: true })).toBeVisible();
  await expect(page.getByLabel('Selected day')).toHaveValue('2026-09-15');
});
test('non-drag move, failure reconciliation, removal and undo are explicit saved operations', async ({
  page,
}) => {
  const model = await setupPlanner(page);
  await page.locator('[data-plan-open="planned"]').click();
  await page.getByRole('button', { name: 'Edit / move meal' }).click();
  await page.getByLabel('Date', { exact: true }).fill(monday);
  model.options.fail = true;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry pending save' })).toBeVisible();
  expect(model.state().mealPlans[0].date).toBe('2026-09-15');
  model.options.fail = false;
  await page.getByRole('button', { name: 'Retry pending save' }).click();
  await page.getByRole('button', { name: 'Back to meal planner', exact: true }).click();
  await expect(slot(page).locator('[data-plan-open]')).toHaveText('Pasta');
  await slot(page)
    .getByRole('button', { name: /^Remove Pasta/ })
    .click();
  await expect(slot(page).locator('[data-plan-open]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(slot(page).locator('[data-plan-open]')).toHaveText('Pasta');
});
test('keyboard library selection adds a meal and selected-day shopping retains scope', async ({
  page,
}) => {
  await setupPlanner(page, []);
  await page.getByRole('button', { name: 'Place Pasta', exact: true }).focus();
  await page.keyboard.press('Enter');
  await slot(page).getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(slot(page).locator('[data-plan-open]')).toHaveText('Pasta');
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Shop for these meals' }).click();
  await expect(page.getByRole('heading', { name: 'Shopping List', exact: true })).toBeVisible();
});
