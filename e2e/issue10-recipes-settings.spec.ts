import { openLanguage, closeSettings } from './helpers/settings';
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/cookbooks', (route) => route.fulfill({ json: { cookbooks: [] } }));
});
import type { Recipe } from '../frontend/src/domain/recipes/types';
const photo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAIAAAAUMWhjAAAAJUlEQVR4nGMo2dJBU8QwasGoBaMWjFowasGoBaMWjFpQMiQsAADmYxBMPDTQ7AAAAABJRU5ErkJggg==',
  'base64',
);
async function setup(page: Page) {
  let saved: Recipe = {
    recipeId: 'pie',
    userId: 'test',
    name: 'Herb pie',
    tags: ['dinner'],
    portions: 2,
    ingredients: [{ name: 'Milk', quantity: 100, unit: 'ml' }],
    instructions: ['Mix', 'Bake'],
    createdAt: '',
    updatedAt: '',
    syncVersion: 1,
  };
  let locations = [{ locationId: 'pantry', name: 'Pantry', createdAt: '' }];
  const images = new Map<string, string>();
  const writes: Record<string, unknown>[] = [];
  const controls = {
    failSave: false,
    failUpload: false,
    holdUpload: false,
    uploadPending: false,
    releaseUpload: () => {},
    inventoryFail: false,
  };
  await page.route('https://mock-api.test/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/cookbooks') return route.fulfill({ json: { cookbooks: [] } });
    const method = req.method();
    if (path === '/recipe-images' && method === 'POST') {
      if (controls.failUpload) {
        controls.failUpload = false;
        return route.fulfill({
          status: 500,
          json: { message: 'Could not upload image. Try again.' },
        });
      }
      if (controls.holdUpload)
        await new Promise<void>((resolve) => {
          controls.releaseUpload = resolve;
          controls.uploadPending = true;
        });
      const dataUrl = req.postDataJSON().dataUrl;
      expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);
      expect(dataUrl.length).toBeLessThan(1400000);
      const id = `11111111-1111-4111-8111-${String(images.size + 1).padStart(12, '0')}`;
      images.set(id, dataUrl);
      return route.fulfill({ status: 201, json: { imageId: id } });
    }
    if (path.startsWith('/recipe-images/'))
      return route.fulfill({ json: { url: images.get(path.split('/').pop()!) } });
    if (path === '/recipes/tags') return route.fulfill({ json: { tags: ['dinner'] } });
    if (path === '/recipes')
      return route.fulfill({
        json: {
          recipes: [
            saved,
            {
              ...saved,
              recipeId: 'rice',
              name: 'Rice bowl',
              ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }],
            },
          ],
        },
      });
    if (path === '/recipes/pie' && method === 'PUT') {
      if (controls.failSave) {
        controls.failSave = false;
        return route.fulfill({ status: 500, json: { message: 'Save failed' } });
      }
      const body = req.postDataJSON();
      writes.push(body);
      saved = { ...saved, ...body };
      return route.fulfill({ json: { recipe: saved } });
    }
    if (path === '/recipes/pie')
      return route.fulfill({
        json: { recipe: saved, ingredientAvailability: [], missingCount: 0 },
      });
    if (path === '/locations' && method === 'POST') {
      const loc = { locationId: 'new-location', name: req.postDataJSON().name, createdAt: '' };
      locations.push(loc);
      return route.fulfill({ status: 201, json: { location: loc } });
    }
    if (path.startsWith('/locations/') && method === 'PUT') {
      const id = path.split('/').pop();
      locations = locations.map((loc) =>
        loc.locationId === id ? { ...loc, name: req.postDataJSON().name } : loc,
      );
      return route.fulfill({ json: { location: locations.find((loc) => loc.locationId === id) } });
    }
    if (path.startsWith('/locations/') && method === 'DELETE') {
      locations = locations.filter((loc) => loc.locationId !== path.split('/').pop());
      return route.fulfill({ status: 204 });
    }
    if (path === '/locations') return route.fulfill({ json: { locations } });
    if (path === '/inventory') {
      if (controls.inventoryFail)
        return route.fulfill({ status: 500, json: { message: 'Inventory unavailable' } });
      const expiry = (days: number) => {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, '0'),
          String(date.getDate()).padStart(2, '0'),
        ].join('-');
      };
      return route.fulfill({
        json: {
          items: [
            {
              itemId: 'milk',
              name: 'Milk',
              unit: 'l',
              quantity: 1,
              category: 'Dairy',
              expirationDate: expiry(3),
              location: 'pantry',
            },
            {
              itemId: 'rice',
              name: 'Rice',
              unit: 'g',
              quantity: 100,
              category: 'Grains',
              expirationDate: expiry(10),
              location: 'pantry',
            },
          ],
          groups: [],
        },
      });
    }
    return route.fulfill({ json: { items: [], groups: [], locations, mealPlans: [] } });
  });
  await page.goto('/');
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
  return { controls, writes, images };
}
async function edit(page: Page) {
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await page.getByRole('button', { name: 'View Herb pie', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
}
const upload = (page: Page, label: string) =>
  page
    .getByLabel(label, { exact: true })
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: photo });
test('photos upload, retain step alignment, survive save retries and display in cooking', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { controls, writes, images } = await setup(page);
  await edit(page);
  controls.holdUpload = true;
  await upload(page, 'Recipe image');
  await expect(page.getByText('Uploading image…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  await expect.poll(() => controls.uploadPending).toBe(true);
  controls.releaseUpload();
  controls.holdUpload = false;
  await expect(page.getByRole('img', { name: 'Recipe image', exact: true })).toBeVisible();
  await upload(page, 'Image for step 2');
  await expect(page.getByRole('img', { name: 'Image for step 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove instruction step 1', exact: true }).click();
  await expect(page.getByLabel('Instructions', { exact: true })).toHaveValue('Bake');
  controls.failSave = true;
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('alert')).toContainText('Save failed');
  await expect(page.getByRole('img', { name: 'Image for step 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Herb pie', exact: true })).toBeVisible();
  expect(writes[0]).toMatchObject({
    instructions: ['Bake'],
    imageId: [...images.keys()][0],
    instructionImageIds: [[...images.keys()][1]],
  });
  await expect(page.getByRole('img', { name: 'Recipe image', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Image for step 1', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/issue10-recipe-photos-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '🍳 Cook', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Image for step 1', exact: true })).toBeVisible();
  await page.reload();
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await page.getByRole('button', { name: 'View Herb pie' }).click();
  await expect(page.getByRole('img', { name: 'Recipe image', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Remove image: Recipe image', exact: true }).click();
  await page.getByRole('button', { name: 'Remove image: Image for step 1', exact: true }).click();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Herb pie', exact: true })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(0);
  expect(writes[1]).toMatchObject({ imageId: null, instructionImageIds: [null] });
  expect(images.size).toBe(2);
});
test('invalid files and upload errors preserve the editor and can be retried', async ({ page }) => {
  const { controls } = await setup(page);
  await edit(page);
  await page
    .getByLabel('Recipe image', { exact: true })
    .setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') });
  await expect(page.getByRole('alert')).toContainText('Choose a JPG');
  controls.failUpload = true;
  await upload(page, 'Recipe image');
  await expect(page.getByRole('alert')).toContainText('Could not upload image');
  await upload(page, 'Recipe image');
  await expect(page.getByRole('img', { name: 'Recipe image', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
});
test('expiration windows compose with search and recover from inventory failure', async ({
  page,
}) => {
  const { controls } = await setup(page);
  controls.inventoryFail = true;
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Inventory filters unavailable');
  await expect(page.getByLabel('Ingredients expiring soon')).toBeDisabled();
  controls.inventoryFail = false;
  await page.getByRole('button', { name: 'Retry inventory' }).click();
  await expect(page.getByLabel('Ingredients expiring soon')).toBeEnabled();
  await page.getByLabel('Ingredients expiring soon').check();
  await expect(page.getByRole('button', { name: 'View Herb pie' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Rice bowl' })).toHaveCount(0);
  await expect(page.getByText(/Use soon: Milk/)).toBeVisible();
  await page.getByLabel('Expiration window').selectOption('14');
  await expect(page.getByRole('button', { name: 'View Rice bowl' })).toBeVisible();
  await page.getByPlaceholder('Search recipes…').fill('Rice');
  await expect(page.getByRole('button', { name: 'View Herb pie' })).toHaveCount(0);
});
test('Settings owns existing locations and renamed data refreshes in Inventory at 320px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await setup(page);
  await expect(page.getByRole('heading', { name: 'Storage Locations' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add item', exact: true })).toHaveCSS(
    'background-color',
    'rgb(216, 243, 220)',
  );
  const remove = page.getByRole('button', { name: 'Remove item', exact: true });
  await expect(remove).toHaveCSS('background-color', 'rgb(255, 229, 229)');
  await remove.click();
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await expect(remove).toHaveCSS('background-color', 'rgb(255, 229, 229)');
  await remove.click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Storage locations', { exact: true }).click();
  await page.getByRole('button', { name: 'Rename Pantry', exact: true }).click();
  await page.getByRole('textbox', { name: 'Rename Pantry', exact: true }).fill('Kitchen');
  await page.getByRole('button', { name: 'Save rename' }).click();
  await expect(page.getByRole('button', { name: 'Rename Kitchen', exact: true })).toBeVisible();
  await page.getByLabel('New location name').fill('Garage');
  await page.getByRole('button', { name: 'Add location' }).click();
  await page.getByRole('button', { name: 'Delete Garage', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete Garage', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Confirm delete Garage', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete Garage', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/issue10-settings-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(page.getByLabel('Filter by location')).toContainText('Kitchen');
});

for (const [language, settings, recipes, filter, image] of [
  ['Español', 'Ajustes', 'Recetas', 'Ingredientes que caducan pronto', 'Imagen de la receta'],
  ['Italiano', 'Impostazioni', 'Ricette', 'Ingredienti in scadenza', 'Immagine della ricetta'],
])
  test(`${language} Settings and expiration controls fit a 320px screen`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await setup(page);
    await openLanguage(page);
    await page.getByRole('button', { name: new RegExp(language) }).click();
    await expect(page.getByRole('button', { name: new RegExp(language) })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await closeSettings(page);
    await page.getByRole('button', { name: settings, exact: true }).click();
    await expect(page.getByRole('heading', { name: settings, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    const nav = page.locator('nav');
    expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(57);
    await page.getByRole('button', { name: recipes, exact: true }).click();
    await expect(page.getByLabel(filter)).toBeEnabled();
    await page.getByLabel(filter).check();
    await expect(page.getByText('Herb pie', { exact: true })).toBeVisible();
    await expect(page.getByText('Rice bowl', { exact: true })).toHaveCount(0);
    await page.getByText('Herb pie', { exact: true }).click();
    await page
      .getByRole('button', { name: language === 'Español' ? 'Editar' : 'Modifica', exact: true })
      .click();
    await expect(page.getByLabel(image, { exact: true })).toBeVisible();
  });
