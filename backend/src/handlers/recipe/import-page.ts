import { load } from 'cheerio';
import { completeImport, importIngredient, parseRecipeText } from '@pantry/domain';
import type { RecipeImportDraft } from '@pantry/domain';

const minutes = (value: unknown): number | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  return match
    ? Math.ceil(Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0) + Number(match[3] ?? 0) / 60)
    : undefined;
};
export function parseRecipePage(html: string, sourceUrl: string): RecipeImportDraft {
  const $ = load(html);
  const clean = (value: unknown): string =>
    typeof value === 'string' ? load(value).text().trim().slice(0, 10000) : '';
  const candidates: Record<string, unknown>[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 20 || candidates.length > 20) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    const row = value as Record<string, unknown>;
    if (
      [row['@type']]
        .flat()
        .some((type) => type === 'Recipe' || type === 'https://schema.org/Recipe')
    )
      candidates.push(row);
    Object.values(row).forEach((child) => visit(child, depth + 1));
  };
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      visit(JSON.parse($(element).text()));
    } catch {
      /* Other malformed page metadata is not a recipe. */
    }
  });
  const recipe = candidates[0];
  if (!recipe) {
    $('script,style,nav,footer,header,noscript').remove();
    $('br').replaceWith('\n');
    $('p,li,h1,h2,h3').each((_, element) => {
      $(element).append('\n');
    });
    const text = ($('main').length ? $('main').text() : $('body').text()).slice(0, 50000);
    return { ...parseRecipeText(text), sourceUrl };
  }
  const instructions: string[] = [];
  const steps = (value: unknown, depth = 0) => {
    if (depth > 15 || instructions.length >= 200) return;
    if (typeof value === 'string') instructions.push(...clean(value).split(/\n+/).filter(Boolean));
    else if (Array.isArray(value)) value.forEach((step) => steps(step, depth + 1));
    else if (value && typeof value === 'object') {
      const step = value as Record<string, unknown>;
      if (step.itemListElement) steps(step.itemListElement, depth + 1);
      else if (step.text) steps(step.text, depth + 1);
      else if (step.name) steps(step.name, depth + 1);
    }
  };
  steps(recipe.recipeInstructions);
  const rawIngredients = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [];
  const ingredients = rawIngredients.slice(0, 200).map((line) => importIngredient(clean(line)));
  const yieldText = clean(String([recipe.recipeYield].flat()[0] ?? ''));
  const yieldMatch = yieldText.match(
    /^(\d+)\s*(?:servings?|portions?|people|personas?|porciones?|raciones?|porzioni|persone)?$/i,
  );
  let image = [recipe.image].flat()[0];
  if (image && typeof image === 'object')
    image = (image as Record<string, unknown>).url ?? (image as Record<string, unknown>).contentUrl;
  let imageUrl: string | undefined;
  try {
    if (typeof image === 'string') {
      const url = new URL(image, sourceUrl);
      if (url.protocol === 'https:') imageUrl = url.href;
    }
  } catch {
    /* Image is optional. */
  }
  return completeImport({
    name: clean(recipe.name),
    ingredients,
    instructions: instructions.slice(0, 200),
    portions: yieldMatch ? Number(yieldMatch[1]) : undefined,
    prepTime: minutes(recipe.prepTime),
    cookTime: minutes(recipe.cookTime),
    sourceUrl,
    imageUrl,
    rawText: [
      clean(recipe.name),
      `Servings: ${yieldText}`,
      `Prep time: ${minutes(recipe.prepTime) ?? 'unknown'} minutes`,
      `Cooking time: ${minutes(recipe.cookTime) ?? 'unknown'} minutes`,
      ...rawIngredients.map(clean),
      ...instructions,
    ]
      .join('\n')
      .slice(0, 50000),
    warnings: [
      'Check the extracted text against the original before saving.',
      ...(candidates.length > 1
        ? ['Multiple recipes found. Review the first recipe or import a more specific link.']
        : []),
    ],
  });
}
