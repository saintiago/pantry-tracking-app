import type { APIGatewayProxyEvent } from 'aws-lambda';
import { parseRecipePage } from '../import-page';
import { parseModelDraft } from '../import-model';
import { recipeImportRequest } from '../recipe-import';
import { fetchImport } from '../import-fetch';
import { extractWithBedrock } from '../import-model';
import { handler } from '../recipe';
import { importIngredient, parseRecipeText } from '@pantry/domain';
jest.mock('../import-fetch', () => ({ fetchImport: jest.fn() }));
jest.mock('../import-model', () => ({
  ...jest.requireActual('../import-model'),
  extractWithBedrock: jest.fn(),
}));
const metadata = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Soup &amp; toast',
  recipeYield: '4 servings',
  prepTime: 'PT15M',
  cookTime: 'PT1H5M',
  image: '/soup.jpg',
  recipeIngredient: ['1 1/2 cups flour', '200 g tomatoes', 'salt to taste'],
  recipeInstructions: [
    {
      '@type': 'HowToSection',
      itemListElement: [{ '@type': 'HowToStep', text: '<p>Mix everything.</p>' }],
    },
    { text: 'Bake.' },
  ],
};
const html = `<html><script type="application/ld+json">${JSON.stringify({ '@graph': [metadata] })}</script></html>`;
beforeEach(() => jest.clearAllMocks());
test('extracts nested structured recipes, fractions, times, image candidates and uncertain units', () => {
  const draft = parseRecipePage(html, 'https://example.org/recipe');
  expect(draft).toMatchObject({
    name: 'Soup & toast',
    portions: 4,
    prepTime: 15,
    cookTime: 65,
    imageUrl: 'https://example.org/soup.jpg',
    instructions: ['Mix everything.', 'Bake.'],
  });
  expect(draft.ingredients[0]).toMatchObject({ quantity: 1.5, unit: 'cup', name: 'flour' });
  expect(draft.ingredients[2]).toMatchObject({ quantity: null, unit: '' });
  expect(draft.warnings.join(' ')).toContain('Ingredient 3 needs review');
});
test('plain printed recipes preserve partial fields for review without inventing quantities', () => {
  const draft = parseRecipeText(
    'Tomato soup\nServes 2\nPrep time: 10 min\nIngredients\n½ cup water\n2 tomates\nInstructions\n1. Simmer.',
  );
  expect(draft).toMatchObject({
    name: 'Tomato soup',
    portions: 2,
    prepTime: 10,
    instructions: ['Simmer.'],
  });
  expect(draft.ingredients[0]).toMatchObject({ quantity: 0.5, unit: 'cup' });
  expect(draft.ingredients[1]).toMatchObject({ quantity: 2, unit: '' });
  expect(importIngredient('1/0 cup flour').quantity).toBeNull();
  expect(importIngredient('1-2 cups flour').quantity).toBeNull();
});
test('rejects unstructured and truncated model output and sanitizes unsupported values', () => {
  expect(() => parseModelDraft('not JSON')).toThrow();
  expect(() => parseModelDraft('{}')).toThrow();
  const draft = parseModelDraft(
    JSON.stringify({
      name: 'Soup',
      portions: 0,
      ingredients: [{ name: 'salt', quantity: -2, unit: 'invented', original: 'salt' }],
      instructions: ['Mix.'],
      sourceUrl: 'https://attacker.invalid',
      imageUrl: 'https://attacker.invalid',
    }),
  );
  expect(draft.portions).toBeUndefined();
  expect(draft.ingredients[0]).toMatchObject({ quantity: null, unit: '' });
  expect(draft.sourceUrl).toBeUndefined();
  expect(draft.imageUrl).toBeUndefined();
});
test('authentication is checked before fetching a URL or invoking Bedrock', async () => {
  const result = await handler({
    resource: '/recipe-import',
    httpMethod: 'POST',
    body: JSON.stringify({ url: 'https://example.org' }),
    requestContext: {},
  } as APIGatewayProxyEvent);
  expect(result.statusCode).toBe(401);
  expect(fetchImport).not.toHaveBeenCalled();
  expect(extractWithBedrock).not.toHaveBeenCalled();
});
test('Bedrock unavailability preserves extracted webpage fields and honest fallback warnings', async () => {
  jest
    .mocked(fetchImport)
    .mockResolvedValue({
      body: Buffer.from(html),
      contentType: 'text/html',
      url: 'https://example.org/recipe',
    });
  jest.mocked(extractWithBedrock).mockRejectedValue(new Error('Account verification'));
  const result = await recipeImportRequest(JSON.stringify({ url: 'https://example.org/recipe' }));
  expect(result.statusCode).toBe(200);
  expect(JSON.parse(result.body).draft).toMatchObject({ method: 'metadata', portions: 4 });
  expect(result.body).toContain('AI extraction is unavailable');
});
test('valid photo requests return an explicit OCR fallback; invalid files never call the model', async () => {
  jest.mocked(extractWithBedrock).mockRejectedValue(new Error('Account verification'));
  expect(
    JSON.parse(
      (
        await recipeImportRequest(
          JSON.stringify({ action: 'photo', dataUrl: 'data:image/jpeg;base64,YWJj' }),
        )
      ).body,
    ).fallback,
  ).toBe('ocr');
  jest.clearAllMocks();
  expect(
    (
      await recipeImportRequest(
        JSON.stringify({ action: 'photo', dataUrl: 'data:text/html;base64,YWJj' }),
      )
    ).statusCode,
  ).toBe(400);
  expect(extractWithBedrock).not.toHaveBeenCalled();
});
test('successful extraction is a draft; only the fetched page controls source and image references', async () => {
  jest
    .mocked(fetchImport)
    .mockResolvedValue({
      body: Buffer.from(html),
      contentType: 'text/html',
      url: 'https://example.org/recipe',
    });
  jest
    .mocked(extractWithBedrock)
    .mockResolvedValue({
      ...parseRecipePage(html, 'https://example.org/recipe'),
      method: 'bedrock',
    });
  const result = JSON.parse(
    (await recipeImportRequest(JSON.stringify({ url: 'https://example.org/recipe' }))).body,
  );
  expect(result.draft.method).toBe('bedrock');
  expect(result.draft.sourceUrl).toBe('https://example.org/recipe');
  expect(result.recipeId).toBeUndefined();
});
