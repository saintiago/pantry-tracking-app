import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/cookbooks', (route) => route.fulfill({ json: { cookbooks: [] } }));
});

async function setup(page: Page) {
  let recipe = {
    recipeId: 'herb',
    name: 'Herb pie',
    tags: ['dinner'],
    portions: 2,
    ingredients: [
      { name: 'Flour', quantity: 200 as number | null, unit: 'g', section: 'For the filling' },
      {
        name: 'Parsley',
        quantity: null as number | null,
        unit: 'handful',
        section: 'For the sauce',
      },
      { name: 'Egg', quantity: 1 as number | null, unit: 'unit', section: '' },
    ],
    instructions: ['Mix', 'Bake'],
    chefNotes: 'Serve warm' as string | null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  const writes: Record<string, unknown>[] = [];
  await page.route('https://mock-api.test/**', (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === '/inventory') return json({ items: [], groups: [] });
    if (path === '/locations') return json({ locations: [] });
    if (path === '/inventory/search') return json({ items: [], count: 0 });
    if (path === '/recipes/tags') return json({ tags: ['dinner'] });
    if (path === '/recipes') return json({ recipes: [recipe] });
    if (path === '/recipes/herb') {
      if (req.method() === 'PUT') {
        const body = req.postDataJSON();
        writes.push(body);
        recipe = { ...recipe, ...body };
        return json({ recipe });
      }
      return json({
        recipe,
        missingCount: 2,
        ingredientAvailability: recipe.ingredients.map((ingredient, index) => ({
          name: ingredient.name,
          required: ingredient.quantity,
          unit: ingredient.unit,
          available: index === 0 ? 100 : index === 2 ? 3 : 0,
          status: index === 0 ? 'partial' : index === 2 ? 'available' : 'missing',
        })),
      });
    }
    return json({});
  });
  await page.goto('/');
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Recipes', exact: true }).click();
  await page.getByRole('button', { name: 'View Herb pie' }).click();
  return { writes };
}

test('editing portions scales exactly once after save, keeps handful empty, and supports removing notes and steps', async ({
  page,
}) => {
  const { writes } = await setup(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Ingredient 1 quantity')).toHaveValue('200');
  await page.getByRole('button', { name: 'Increase portions' }).click();
  await page.getByRole('button', { name: 'Increase portions' }).click();
  await expect(page.getByLabel('Ingredient 1 quantity')).toHaveValue('200');
  await expect(page.getByLabel('Ingredient 2 quantity')).toHaveValue('');
  await page.getByLabel("Chef's notes").fill('');
  await page.getByRole('button', { name: 'Remove instruction step 1' }).click();
  await expect(page.getByLabel('Instructions', { exact: true })).toHaveValue('Bake');
  await page.getByRole('button', { name: '+ Add Step' }).click();
  await page.getByLabel('Instruction step 2', { exact: true }).fill('Rest');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Herb pie', exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    portions: 4,
    chefNotes: null,
    instructions: ['Bake', 'Rest'],
    ingredients: [
      { name: 'Flour', quantity: 400, section: 'For the filling' },
      { name: 'Parsley', quantity: null, section: 'For the sauce' },
      { name: 'Egg', quantity: 2 },
    ],
  });
  await expect(page.getByRole('region', { name: "Chef's notes" })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Ingredient 1 quantity')).toHaveValue('400');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].ingredients).toEqual(writes[0].ingredients);
});

test('changing an empty handful to another unit requires a quantity', async ({ page }) => {
  const { writes } = await setup(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Ingredient 2 unit').selectOption('unit');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Enter a valid quantity (e.g. 1, 1/2, 1 1/4).')).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByLabel('Ingredient 2 quantity').fill('1');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(() => writes.length).toBe(1);
});

for (const width of [390, 1440]) {
  test(`unified ingredient layout preserves all statuses and sections at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await setup(page);
    const ingredients = page.getByRole('region', { name: 'Ingredients', exact: true });
    for (const name of ['Flour', 'Parsley', 'Egg'])
      await expect(ingredients.getByText(name, { exact: true })).toHaveCount(1);
    await expect(ingredients.getByText('have 100 / need 200 grams')).toBeVisible();
    await expect(ingredients.getByText('missing', { exact: true })).toBeVisible();
    await expect(ingredients.getByText('available', { exact: true })).toBeVisible();
    const quantity = (await ingredients.getByText('200 grams', { exact: true }).boundingBox())!;
    const name = (await ingredients.getByText('Flour', { exact: true }).boundingBox())!;
    expect(name.x - (quantity.x + quantity.width)).toBeLessThan(12);
    await expect(ingredients.getByRole('heading', { name: 'For the filling' })).toBeVisible();
    await expect(ingredients.getByRole('heading', { name: 'For the sauce' })).toBeVisible();
    const notes = (await page.getByRole('region', { name: "Chef's notes" }).boundingBox())!;
    const instructions = (await page.getByRole('list').filter({ hasText: 'Bake' }).boundingBox())!;
    expect(notes.y).toBeGreaterThan(instructions.y);
    await page.screenshot({ path: `test-results/recipe-issue4-${width}.png`, fullPage: true });
  });
}
