import { departmentFor } from './departments';

const productIcons: [RegExp, string][] = [
  [/\b(ginger|jengibre|zenzero)\b/i, '🫚'],
  [
    /\b(fenugreek|alholva|fieno greco|cumin|comino|cumino|coriander|cilantro|basil|albahaca|basilico|herbs?|oregano|orégano|cinnamon|canela|paprika|spice|especia)\b/i,
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
  [/\b(bread|pan|pane|baguette|croissant|bakery|panadería)\b/i, '🍞'],
  [/\b(chicken|pollo)\b/i, '🍗'],
  [/\b(fish|salmon|salmón|pescado|pesce|tuna|atún|tonno)\b/i, '🐟'],
  [/\b(rice|arroz|riso)\b/i, '🍚'],
  [/\b(pasta|spaghetti|lasagna)\b/i, '🍝'],
  [/\b(salt|sal|sale)\b/i, '🧂'],
  [/\b(coffee|café|caffe)\b/i, '☕'],
  [/\b(clean|detergent|washing|dish soap|spray|limpieza|hogar)\b/i, '🧼'],
  [/\b(paper towel|toilet paper|roll|kitchen roll|papel)\b/i, '🧻'],
  [/\b(shampoo|soap|deodorant|hygiene|higiene)\b/i, '🧴'],
  [/\b(water|juice|soda|beverage|drink|bebida|vino|wine|beer|cerveza)\b/i, '🥤'],
];

const departmentIcons: Record<string, string> = {
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
  Other: '🛒',
};

export function suggestedProductIcon(name: string, category = '', explicitIcon = ''): string {
  return (
    explicitIcon ||
    productIcons.find(([pattern]) => pattern.test(`${name} ${category}`))?.[1] ||
    departmentIcons[departmentFor(name, category)] ||
    '🛒'
  );
}

export function suggestedCategoryIcon(category: string): string {
  return departmentIcons[departmentFor(category, category)] ?? '🛒';
}
