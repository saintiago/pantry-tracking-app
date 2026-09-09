import { test, expect } from '@playwright/test';
import { setupPlanner, recipe, monday } from './helpers/planner';

async function library(page: import('@playwright/test').Page) {
  await setupPlanner(page, []);
  const recipes = [
    { ...recipe, prepTime: 10, cookTime: 20, imageId: 'pasta-cover' },
    {
      ...recipe,
      recipeId: 'apple',
      name: 'Apple bowl',
      prepTime: 2,
      cookTime: 0,
      tags: ['breakfast'],
    },
  ];
  await page.route('**/recipes', (route) => route.fulfill({ json: { recipes } }));
  await page.route('**/cookbooks', (route) =>
    route.fulfill({
      json: {
        cookbooks: Array.from({ length: 5 }, (_, i) => ({
          cookbookId: `book-${i}`,
          name: `Favorites ${i}`,
          description: 'Meals for busy evenings',
          recipeIds: ['pasta'],
          imageId: `cover-${i}`,
          version: 1,
          createdAt: monday,
          updatedAt: monday,
        })),
      },
    }),
  );
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 3;
    return c.toDataURL();
  });
  await page.route('**/recipe-images/*', (route) => route.fulfill({ json: { url: png } }));
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open cookbook Favorites 0' })).toBeVisible();
}

test('cookbook covers open members, all recipes hides shelf, views and filters survive detail navigation', async ({
  page,
}) => {
  await library(page);
  const first = page.getByRole('button', { name: 'Open cookbook Favorites 0' });
  await expect(first.getByRole('img')).toBeVisible();
  const a = await first.boundingBox();
  const b = await page.getByRole('button', { name: 'Open cookbook Favorites 1' }).boundingBox();
  expect(a!.width).toBeLessThanOrEqual(202);
  expect(a!.y).toBe(b!.y);
  await page.screenshot({ path: 'test-results/issue17-shelf.png' });
  await first.getByRole('img').click();
  await expect(page.getByRole('button', { name: 'View Pasta', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Apple bowl', exact: true })).toBeHidden();
  await expect(page.getByLabel('Recipe view', { exact: true })).toHaveValue('icons');
  await expect(page.getByRole('button', { name: 'Edit cookbook Favorites 0' })).toHaveText('✎');
  await page.getByLabel('Recipe view', { exact: true }).selectOption('images');
  await page.getByRole('button', { name: 'View Pasta', exact: true }).click();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page.getByLabel('Recipe view', { exact: true })).toHaveValue('images');
  await expect(page.getByRole('button', { name: 'View Apple bowl', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'All recipes', exact: true }).click();
  await expect(page.getByRole('button', { name: /Open cookbook/ })).toHaveCount(0);
  await expect(page.getByLabel('Recipe view', { exact: true })).toHaveValue('list');
  await expect(page.getByRole('button', { name: 'View Apple bowl', exact: true })).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Max prep time (min)' });
  expect((await slider.boundingBox())!.y).toBeLessThan(
    (await page.getByRole('searchbox', { name: 'Search recipes' }).boundingBox())!.y,
  );
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('button', { name: 'View Pasta', exact: true })).toBeHidden();
  await page.getByLabel('Recipe view', { exact: true }).selectOption('icons');
  await expect(page.getByRole('button', { name: 'View Apple bowl', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Pasta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'My cookbooks', exact: true }).click();
  await expect(page.getByLabel('Recipe view', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'View Pasta', exact: true })).toBeHidden();
});

test('mobile cookbook hold reveals icon actions without opening; view layouts fit 320 pixels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await library(page);
  const first = page.getByRole('button', { name: 'Open cookbook Favorites 0' });
  await page.mouse.move(0, 0);
  const edit = page.getByRole('button', { name: 'Edit cookbook Favorites 0' });
  await expect(edit).toBeHidden();
  await first.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 60, clientY: 300 });
  await expect(edit).toBeVisible();
  await first.dispatchEvent('pointerup', { pointerType: 'touch' });
  await first.dispatchEvent('click');
  await expect(page.getByRole('button', { name: 'View Pasta', exact: true })).toBeHidden();
  await edit.click();
  await expect(page.getByRole('form', { name: 'Cookbook editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await first.click();
  await page.screenshot({ path: 'test-results/issue17-mobile.png' });
  for (const view of ['list', 'icons', 'images']) {
    await page.getByLabel('Recipe view', { exact: true }).selectOption(view);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('new cookbook lives under New Recipe and cover uploads are resized and compressed', async ({
  page,
}) => {
  await setupPlanner(page, []);
  let uploaded = '';
  await page.route('**/recipe-images', (route) => {
    uploaded = route.request().postDataJSON().dataUrl;
    return route.fulfill({ status: 201, json: { imageId: 'cover' } });
  });
  await page.route('**/recipe-images/cover', (route) => route.fulfill({ json: { url: uploaded } }));
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New cookbook', exact: true })).toBeHidden();
  await page.getByRole('button', { name: '+ New Recipe', exact: true }).click();
  await page.getByRole('button', { name: 'New cookbook', exact: true }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 2400;
    c.height = 1800;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#48a080';
    ctx.fillRect(0, 0, c.width, c.height);
    return c.toDataURL();
  });
  await page.getByLabel('Cookbook cover', { exact: true }).setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png.split(',')[1], 'base64'),
  });
  await expect(page.getByRole('button', { name: 'Save cookbook', exact: true })).toBeEnabled();
  expect(uploaded.startsWith('data:image/jpeg;base64,')).toBe(true);
  expect(Buffer.from(uploaded.split(',')[1], 'base64').length).toBeLessThan(203000);
  const size = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = data;
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }, uploaded);
  expect(size).toEqual([720, 540]);
});
