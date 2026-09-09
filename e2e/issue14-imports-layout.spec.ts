import { test, expect } from '@playwright/test';
import { setupPlanner, meal, monday } from './helpers/planner';
const draft = {
  name: 'Imported tomato toast',
  ingredients: [
    { name: 'Bread', quantity: 2, unit: 'slice', original: '2 slices bread' },
    { name: 'Tomato', quantity: 1, unit: 'piece', original: '1 tomato' },
  ],
  instructions: ['Toast the bread.', 'Slice tomato and serve.'],
  portions: 1,
  prepTime: 5,
  cookTime: 3,
  rawText: 'Tomato toast\n2 slices bread\n1 tomato',
  warnings: ['Cooking time was not found'],
  method: 'bedrock',
  sourceUrl: 'https://example.org/recipe',
};
async function openImport(page: import('@playwright/test').Page, mode = 'Import from link') {
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await page.getByRole('button', { name: '+ New Recipe' }).click();
  await page.getByRole('button', { name: mode, exact: true }).click();
}
test('link extraction is reviewed, reordered and edited before the only recipe save', async ({
  page,
}) => {
  await setupPlanner(page, []);
  let saves = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/recipes' && request.method() === 'POST') saves++;
  });
  await page.route('**/recipe-import', (route) => route.fulfill({ json: { draft } }));
  await openImport(page);
  await page.getByLabel('Recipe webpage link').fill('https://example.org/recipe');
  await page.getByRole('button', { name: 'Extract recipe', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Import review' })).toBeVisible();
  expect(saves).toBe(0);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(draft.name);
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Reviewed tomato toast');
  await page.getByRole('button', { name: 'Move ingredient 1 down', exact: true }).click();
  await page.getByRole('button', { name: 'Move instruction step 1 down', exact: true }).click();
  await expect(page.getByLabel('Instructions', { exact: true })).toHaveValue(
    'Slice tomato and serve.',
  );
  await page.getByRole('combobox', { name: 'Add a tag…' }).fill('imported');
  await page.getByRole('combobox', { name: 'Add a tag…' }).press('Enter');
  await page.getByRole('button', { name: 'Create Recipe', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Reviewed tomato toast', exact: true }),
  ).toBeVisible();
  expect(saves).toBe(1);
  await expect(page.getByText('Extracted with Amazon Bedrock')).toHaveCount(0);
});
test('failed imports retry, accept a replacement link, or continue into manual editing', async ({
  page,
}) => {
  await setupPlanner(page, []);
  let calls = 0;
  await page.route('**/recipe-import', (route) => {
    calls++;
    return route.fulfill({
      status: 422,
      json: { message: 'No recipe could be extracted. Try another source or continue manually.' },
    });
  });
  await openImport(page);
  await page.getByLabel('Recipe webpage link').fill('https://example.org/one');
  await page.getByRole('button', { name: 'Extract recipe', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No recipe could be extracted');
  await page.getByLabel('Recipe webpage link').fill('https://example.org/two');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
  expect(calls).toBe(2);
  await page.getByRole('button', { name: 'Continue manually', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New Recipe', exact: true })).toBeVisible();
});
test('photo fallback runs the real OCR engine locally and produces an editable draft', async ({
  page,
}) => {
  test.setTimeout(90000);
  await setupPlanner(page, []);
  await page.route('**/recipe-import', (route) =>
    route.fulfill({
      json: {
        fallback: 'ocr',
        message:
          'AI extraction is unavailable. Use on-device text recognition or continue manually.',
      },
    }),
  );
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1100;
    canvas.height = 800;
    const c = canvas.getContext('2d')!;
    c.fillStyle = 'white';
    c.fillRect(0, 0, 1100, 800);
    c.fillStyle = 'black';
    c.font = '36px Arial';
    [
      'Tomato soup',
      'Serves 2',
      'Prep time: 10 min',
      'Ingredients',
      '200 g tomatoes',
      '500 ml water',
      'Instructions',
      '1. Boil the water.',
      '2. Add tomatoes and simmer.',
    ].forEach((line, index) => c.fillText(line, 45, 60 + index * 70));
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await openImport(page, 'Import from photo');
  await expect(page.getByLabel('Take a recipe photo')).toHaveAttribute('capture', 'environment');
  await page.getByLabel('Upload a recipe photo').setInputFiles({
    name: 'printed-recipe.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await page.getByRole('button', { name: 'Extract recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Use on-device text recognition', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Import review' })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
    /Tomato soup/i,
  );
  await expect(page.getByLabel('Instructions', { exact: true })).toHaveValue(/Boil the water/i);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
});
for (const width of [320, 390, 1440])
  test(`compact navigation and planner controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setupPlanner(page, [meal('source', monday)]);
    await expect(page.getByText('From recipes to your meal plan')).toBeVisible();
    await expect(page.getByRole('group', { name: 'View', exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('button', { name: 'Settings', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Settings', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/All planned portions/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Storage locations', { exact: true })).toBeVisible();
    await expect(page.getByLabel('New location name')).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
