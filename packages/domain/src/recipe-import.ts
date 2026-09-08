import { UNIT_METADATA } from './units';

/** A review draft, never a persisted recipe or an inventory match. */
export interface RecipeImportDraft {
  name: string;
  ingredients: { name: string; quantity: number | null; unit: string; original: string }[];
  instructions: string[];
  portions?: number;
  prepTime?: number;
  cookTime?: number;
  sourceUrl?: string;
  imageUrl?: string;
  rawText: string;
  warnings: string[];
  method?: 'bedrock' | 'metadata' | 'ocr';
}

const aliases: Record<string, string> = {
  cucharadita: 'tsp',
  cucharaditas: 'tsp',
  cucchiaino: 'tsp',
  cucchiaini: 'tsp',
  cucharada: 'tbsp',
  cucharadas: 'tbsp',
  cucchiaio: 'tbsp',
  cucchiai: 'tbsp',
  taza: 'cup',
  tazas: 'cup',
  tazza: 'cup',
  tazze: 'cup',
  gr: 'g',
  gramos: 'g',
  gramo: 'g',
  grammi: 'g',
  grammo: 'g',
  litros: 'l',
  litro: 'l',
  litri: 'l',
  mililitros: 'ml',
  millilitri: 'ml',
  diente: 'clove',
  dientes: 'clove',
  spicchio: 'clove',
  spicchi: 'clove',
};
for (const [key, info] of Object.entries(UNIT_METADATA))
  for (const label of [key, info.singular, info.plural, info.abbreviation])
    aliases[label.toLowerCase().replace(/\.$/, '')] = key;
const fractions: Record<string, string> = {
  '¼': ' 1/4',
  '½': ' 1/2',
  '¾': ' 3/4',
  '⅓': ' 1/3',
  '⅔': ' 2/3',
  '⅛': ' 1/8',
};
export function importIngredient(original: string): RecipeImportDraft['ingredients'][number] {
  const line = original
    .replace(/^[•*-]\s*/, '')
    .replace(/[¼½¾⅓⅔⅛]/g, (c) => fractions[c])
    .trim();
  const match = line.match(/^(\d+(?:[.,]\d+)?(?:\s+\d+\s*\/\s*\d+)?|\d+\s*\/\s*\d+)\s*(.*)$/);
  if (!match) return { name: original, quantity: null, unit: '', original };
  const parts = match[1].replace(',', '.').split(/\s+/);
  let quantity = parts.reduce((sum, part) => {
    const [a, b] = part.split('/').map(Number);
    return sum + (b === undefined ? a : a / b);
  }, 0);
  // The decimal branch can stop before a simple fraction's slash.
  let rest = match[2];
  const denominator = rest.match(/^\/\s*(\d+)\s*(.*)$/);
  if (denominator) {
    quantity /= Number(denominator[1]);
    rest = denominator[2];
  }
  if (!Number.isFinite(quantity) || quantity <= 0 || /^[-–/]/.test(rest))
    return { name: original, quantity: null, unit: '', original };
  const token = rest.match(/^([^\s.]+)\.?\s*(.*)$/);
  const unit = token && aliases[token[1].toLowerCase()];
  return {
    name: unit ? token![2].replace(/^(?:of|de|di)\s+/i, '') : rest,
    quantity,
    unit: unit || '',
    original,
  };
}

export function completeImport(draft: RecipeImportDraft): RecipeImportDraft {
  const warnings = [...draft.warnings];
  if (!draft.name.trim()) warnings.push('Recipe title needs review');
  if (!draft.ingredients.length) warnings.push('Ingredients could not be extracted');
  if (!draft.instructions.length) warnings.push('Preparation steps could not be extracted');
  if (!draft.portions) warnings.push('Servings need review');
  if (draft.prepTime === undefined) warnings.push('Prep time was not found');
  if (draft.cookTime === undefined) warnings.push('Cooking time was not found');
  draft.ingredients.forEach((item, i) => {
    if (!item.name.trim() || item.quantity === null || !item.unit)
      warnings.push(`Ingredient ${i + 1} needs review: ${item.original}`);
  });
  return { ...draft, warnings: [...new Set(warnings)] };
}

export function parseRecipeText(text: string): RecipeImportDraft {
  const lines = text
    .slice(0, 50000)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const draft: RecipeImportDraft = {
    name: '',
    ingredients: [],
    instructions: [],
    rawText: text.slice(0, 50000),
    warnings: ['Check the extracted text against the original before saving.'],
  };
  let section = '';
  for (const line of lines) {
    if (/^(ingredients|ingredientes|ingredienti)\s*:?$/i.test(line)) {
      section = 'ingredients';
      continue;
    }
    if (
      /^(instructions|directions|method|preparation|steps|preparaci[oó]n|instrucciones|elaboraci[oó]n|preparazione|procedimento)\s*:?$/i.test(
        line,
      )
    ) {
      section = 'steps';
      continue;
    }
    const yieldMatch =
      line.match(
        /(?:servings|serves|portions|porciones|raciones|personas|porzioni|persone)\s*:?\s*(\d+)/i,
      ) ?? line.match(/^(\d+)\s*(?:servings|porciones|porzioni|personas|persone)\b/i);
    if (yieldMatch) {
      draft.portions = Number(yieldMatch[1]);
      continue;
    }
    const time = line.match(
      /^(prep(?:aration)?(?: time)?|cook(?:ing)?(?: time)?|tiempo de preparaci[oó]n|tiempo de cocci[oó]n|preparazione|cottura)\s*:?\s*(\d+)\s*(min(?:utes|utos|uti)?|h(?:ours|oras|ore)?)\b/i,
    );
    if (time) {
      const minutes = Number(time[2]) * (/^h/i.test(time[3]) ? 60 : 1);
      if (/cook|cocci|cottura/i.test(time[1])) draft.cookTime = minutes;
      else draft.prepTime = minutes;
      continue;
    }
    if (!draft.name && !section) {
      draft.name = line;
      continue;
    }
    if (section === 'ingredients') draft.ingredients.push(importIngredient(line));
    else if (section === 'steps') draft.instructions.push(line.replace(/^\d+[.)]\s*/, ''));
  }
  return completeImport(draft);
}
