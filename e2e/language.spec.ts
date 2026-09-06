import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const deviceKey = 'pantry-language-v1:test-user-id';
const recipe = {
  recipeId: 'r1',
  name: 'Recipes',
  tags: ['Pantry'],
  portions: 2,
  ingredients: [{ name: 'Ingredients', quantity: 2, unit: 'piece' }],
  instructions: ['Keep these original instructions.'],
  chefNotes: 'Original notes.',
  prepTime: 10,
  cookTime: 20,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
type Account = { language?: string; failSave?: boolean; saves?: number };
async function setup(context: BrowserContext, account: Account = {}) {
  await context.addInitScript(() => localStorage.setItem('mock-language-api', 'true'));
  await context.route('https://mock-api.test/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/test-account-language') {
      if (request.method() === 'PUT') {
        account.saves = (account.saves ?? 0) + 1;
        if (account.failSave) return route.fulfill({ status: 503, json: {} });
        account.language = request.postDataJSON().language;
      }
      return route.fulfill({ json: { language: account.language } });
    }
    if (path === '/inventory') return route.fulfill({ json: { items: [], groups: [] } });
    if (path === '/locations')
      return route.fulfill({ json: { locations: [{ locationId: 'p1', name: 'Pantry' }] } });
    if (path === '/recipes/tags') return route.fulfill({ json: { tags: ['Pantry'] } });
    if (path === '/recipes') return route.fulfill({ json: { recipes: [recipe] } });
    if (path === '/recipes/r1')
      return route.fulfill({
        json: {
          recipe,
          missingCount: 1,
          ingredientAvailability: [
            { name: 'Ingredients', required: 2, available: 0, unit: 'piece', status: 'missing' },
          ],
        },
      });
    if (path === '/meal-plans') return route.fulfill({ json: { mealPlans: [] } });
    return route.fulfill({ json: { items: [], values: [], count: 0 } });
  });
}
async function login(page: Page) {
  await page.goto('/');
  await page.locator('input[type=email]').fill('test@example.com');
  await page.locator('input[type=password]').fill('TestPassword123!');
  await page.locator('button[type=submit]').click();
  await expect(page.locator('header')).toBeVisible();
}
async function choose(page: Page, language: string) {
  await page.locator('header button[aria-controls="language-options"]').click();
  await page.getByRole('button', { name: new RegExp(language) }).click();
  await page.locator('#language-options').press('Escape');
}

test('new browser inherits account, while each device keeps its own language', async ({
  browser,
}) => {
  const account: Account = { language: 'es' };
  const first = await browser.newContext({ baseURL: 'http://localhost:5173', locale: 'en-US' });
  const second = await browser.newContext({ baseURL: 'http://localhost:5173', locale: 'en-US' });
  try {
    await setup(first, account);
    await setup(second, account);
    const a = await first.newPage();
    const b = await second.newPage();
    await login(a);
    await expect(a.locator('html')).toHaveAttribute('lang', 'es');
    await expect
      .poll(() => a.evaluate((key) => JSON.parse(localStorage.getItem(key)!).language, deviceKey))
      .toBe('es');
    await choose(a, 'Italiano');
    await a.locator('header button[aria-controls="language-options"]').click();
    await a.getByRole('button', { name: "Usa questa lingua per l'account" }).click();
    await expect.poll(() => account.language).toBe('it');
    await a.locator('#language-options').press('Escape');
    await login(b);
    await expect(b.locator('html')).toHaveAttribute('lang', 'it');
    await choose(b, 'Español');
    await expect(a.locator('html')).toHaveAttribute('lang', 'it');
    await login(b); // Mock sign-in is intentionally repeated after reload.
    await expect(b.locator('html')).toHaveAttribute('lang', 'es');
    expect(account.language).toBe('it');
  } finally {
    await first.close();
    await second.close();
  }
});

test('detects supported browser language and uses English for unsupported languages', async ({
  browser,
}) => {
  for (const [locale, expected] of [
    ['it-IT', 'it'],
    ['es-MX', 'es'],
    ['fr-FR', 'en'],
  ]) {
    const context = await browser.newContext({ baseURL: 'http://localhost:5173', locale });
    try {
      await setup(context);
      const page = await context.newPage();
      await login(page);
      await expect(page.locator('html')).toHaveAttribute('lang', expected);
      await expect
        .poll(() =>
          page.evaluate(
            (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.language,
            deviceKey,
          ),
        )
        .toBe(expected);
    } finally {
      await context.close();
    }
  }
});

test('switching language preserves an unfinished form and canonical option values', async ({
  page,
  context,
}) => {
  await setup(context);
  await login(page);
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByRole('menuitem', { name: /Manual Entry/ }).click();
  await page.getByRole('textbox', { name: 'Product Name', exact: true }).fill('Recipes');
  await page.getByRole('textbox', { name: 'Category', exact: true }).fill('Pantry');
  await choose(page, 'Español');
  await expect(page.getByRole('textbox', { name: 'Nombre del producto', exact: true })).toHaveValue(
    'Recipes',
  );
  await expect(page.getByRole('textbox', { name: 'Categoría', exact: true })).toHaveValue('Pantry');
  await page
    .getByRole('combobox', { name: 'Unidad', exact: true })
    .selectOption({ label: 'pieza' });
  await choose(page, 'Italiano');
  await expect(page.getByRole('textbox', { name: 'Nome del prodotto', exact: true })).toHaveValue(
    'Recipes',
  );
  await expect(page.getByRole('combobox', { name: 'Unità', exact: true })).toHaveValue('piece');
  await expect(
    page.getByRole('combobox', { name: 'Unità', exact: true }).locator('option:checked'),
  ).toHaveText('pezzo');
  await expect(
    page
      .getByRole('combobox', { name: 'Posizione', exact: true })
      .getByRole('option', { name: 'Pantry' }),
  ).toBeAttached();
});

test('late recipe data uses the new language while all user content stays original', async ({
  page,
  context,
}) => {
  await setup(context);
  await login(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://mock-api.test/recipes', async (route) => {
    await pending;
    await route.fulfill({ json: { recipes: [recipe] } });
  });
  await page.getByRole('button', { name: /Recipes/, exact: false }).click();
  await expect(page.getByRole('status', { name: 'Loading recipes' })).toBeVisible();
  await choose(page, 'Español');
  release();
  await page.getByRole('button', { name: 'Ver Recipes' }).click();
  await expect(page.getByRole('heading', { name: 'Ingredientes', exact: true })).toBeVisible();
  await expect(page.getByText('2 piezas', { exact: true })).toBeVisible();
  await expect(page.getByText('Ingredients', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Keep these original instructions.' }),
  ).toBeVisible();
  await choose(page, 'Italiano');
  await expect(page.getByRole('heading', { name: 'Ingredienti', exact: true })).toBeVisible();
  await expect(page.getByText('2 pezzi', { exact: true })).toBeVisible();
  await expect(page.getByText('Original notes.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Cucina/, exact: false }).click();
  await choose(page, 'Español');
  await expect(page.getByText('Keep these original instructions.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finalizar', exact: true })).toBeVisible();
});

test('errors retranslate after switching and account-save failure can be retried', async ({
  page,
  context,
}) => {
  const account: Account = { failSave: true };
  await setup(context, account);
  await login(page);
  await choose(page, 'Español');
  await page.locator('header button[aria-controls="language-options"]').click();
  await page.getByRole('button', { name: 'Usar este idioma para la cuenta' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo guardar el idioma');
  await page.getByRole('button', { name: /Italiano/ }).click();
  await page.getByRole('button', { name: "Usa questa lingua per l'account" }).click();
  await expect(page.getByRole('alert')).toContainText('Impossibile salvare la lingua');
  account.failSave = false;
  await page.getByRole('button', { name: "Usa questa lingua per l'account" }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => account.language).toBe('it');
});

test('shopping, manual department options and calendar use the selected language on mobile', async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await setup(context, { language: 'es' });
  await login(page);
  await page.getByRole('button', { name: /Lista de la compra/ }).click();
  await expect(page.getByRole('heading', { name: 'Lista de la compra' })).toBeVisible();
  await expect(page.getByText('Otras cosas que comprar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Añadir algo que comprar' }).click();
  const department = page.getByRole('combobox', { name: 'Sección del supermercado' });
  await department.selectOption({ label: 'Lácteos y huevos' });
  await expect(department).toHaveValue('Dairy & eggs');
  await choose(page, 'Italiano');
  await expect(
    page.getByRole('combobox', { name: 'Reparto del supermercato' }).locator('option:checked'),
  ).toHaveText('Latticini e uova');
  await page.getByRole('button', { name: /Piano pasti/ }).click();
  await expect(page.getByRole('heading', { name: 'Pianificazione pasti' })).toBeVisible();
  await expect(page.getByText('colazione', { exact: true }).first()).toBeVisible();
  await page.locator('header button[aria-controls="language-options"]').click();
  await expect(page.locator('#language-options')).toBeInViewport();
  const menu = await page.locator('#language-options').boundingBox();
  expect(menu!.x).toBeGreaterThanOrEqual(0);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(320);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-language.png'), fullPage: true });
});

test('blocked local storage keeps the app usable and explains the persistence failure', async ({
  page,
  context,
}) => {
  await setup(context);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('pantry-language-v1:')) throw new DOMException('blocked', 'SecurityError');
      return original.call(this, key, value);
    };
  });
  await login(page);
  await choose(page, 'Español');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.locator('header button[aria-controls="language-options"]').click();
  await expect(page.getByRole('alert')).toContainText('no se pudo guardar en el dispositivo');
});
