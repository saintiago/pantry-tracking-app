import type { ShoppingLine } from './companion';
import { DEPARTMENTS } from './departments';
export type Arrangement = 'aisle' | 'recipe' | 'az' | 'recent';
export function arrangeLines(
  lines: ShoppingLine[],
  arrangement: Arrangement,
): { title: string; lines: ShoppingLine[] }[] {
  const sorted = [...lines].sort((a, b) =>
    arrangement === 'recent'
      ? (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name),
  );
  if (arrangement === 'az' || arrangement === 'recent') return [{ title: '', lines: sorted }];
  if (arrangement === 'aisle')
    return DEPARTMENTS.map((title) => ({
      title,
      lines: sorted.filter((l) => l.department === title),
    })).filter((g) => g.lines.length);
  const groups = new Map<string, ShoppingLine[]>();
  for (const line of sorted) {
    // A combined product is shown once, under its complete set of source recipes.
    const names = [...new Set(line.meal?.contributions.map((c) => c.recipeName) ?? [])].sort();
    const title = names.length
      ? names.join(' + ')
      : line.sources.includes('Restock')
        ? 'General restock'
        : 'Other things to buy';
    groups.set(title, [...(groups.get(title) ?? []), line]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, lines]) => ({ title, lines }));
}
const foodIcons: [RegExp, string][] = [
  [/\b(ginger|jengibre|zenzero)\b/i, '🫚'],
  [
    /\b(fenugreek|alholva|fieno greco|cumin|comino|cumino|coriander|cilantro|basil|albahaca|basilico|herbs?|oregano|orégano)\b/i,
    '🌿',
  ],
  [/\b(tomato\w*|tomate\w*|pomodor\w*)\b/i, '🍅'],
  [/\b(onion\w*|cebolla\w*|cipoll\w*)\b/i, '🧅'],
  [/\b(garlic|ajo|aglio)\b/i, '🧄'],
  [/\b(potato\w*|patata\w*|papas?)\b/i, '🥔'],
  [/\b(carrot\w*|zanahoria\w*|carot\w*)\b/i, '🥕'],
  [/\b(apple\w*|manzana\w*|mele?)\b/i, '🍎'],
  [/\b(banana\w*|plátano\w*)\b/i, '🍌'],
  [/\b(lemon\w*|limón|limones|limon\w*)\b/i, '🍋'],
  [/\b(egg\w*|huevo\w*|uov\w*)\b/i, '🥚'],
  [/\b(milk|leche|latte)\b/i, '🥛'],
  [/\b(cheese|queso|formaggio|parmesan|mozzarella)\b/i, '🧀'],
  [/\b(bread|pan|pane|baguette)\b/i, '🍞'],
  [/\b(chicken|pollo)\b/i, '🍗'],
  [/\b(fish|salmon|salmón|pescado|pesce|tuna|atún|tonno)\b/i, '🐟'],
  [/\b(rice|arroz|riso)\b/i, '🍚'],
  [/\b(pasta|spaghetti|lasagna)\b/i, '🍝'],
  [/\b(salt|sal|sale)\b/i, '🧂'],
];
const aisleIcons: Record<string, string> = {
  'Fruit & vegetables': '🥬',
  'Meat & fish': '🥩',
  Bakery: '🥖',
  'Dairy & eggs': '🧀',
  'Herbs & spices': '🌿',
  Pantry: '🥫',
  Frozen: '🧊',
  Drinks: '🥤',
  Household: '🧹',
  'Personal care': '🧴',
  Baby: '🍼',
  Pets: '🐾',
};
export function shoppingIcon(line: Pick<ShoppingLine, 'name' | 'department' | 'icon'>): string {
  return (
    line.icon ||
    foodIcons.find(([pattern]) => pattern.test(line.name))?.[1] ||
    aisleIcons[line.department] ||
    '🛒'
  );
}
