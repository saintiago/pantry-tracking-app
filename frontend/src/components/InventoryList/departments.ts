/** Carrefour Spain-inspired departments; no store-specific aisle ordering is assumed. */
export const DEPARTMENTS = [
  'Fruit & vegetables',
  'Meat & fish',
  'Dairy & eggs',
  'Bakery',
  'Pantry',
  'Frozen',
  'Drinks',
  'Household',
  'Personal care',
  'Baby',
  'Pets',
  'Other',
] as const;
export type Department = (typeof DEPARTMENTS)[number];
const rules: [Department, RegExp][] = [
  ['Household', /clean|detergent|washing|dish soap|spray|paper towel|limpieza|hogar/],
  ['Personal care', /shampoo|tooth|deodorant|hygiene|higiene|perfumer/],
  ['Baby', /baby|napp|diaper|bebé/],
  ['Pets', /pet|cat food|dog food|mascota/],
  ['Frozen', /frozen|congelad|ice cream/],
  ['Drinks', /wine|beer|water|juice|soda|beverage|drink|bebida|vino|cerveza/],
  [
    'Dairy & eggs',
    /milk|cheese|butter|yog[hu]*urt|cream|egg|mozzarella|parmesan|dairy|leche|queso|huevo|lácteo/,
  ],
  [
    'Meat & fish',
    /meat|beef|chicken|pork|ham\b|turkey|salmon|fish|prawn|tuna|carne|pescad|pollo|jamón/,
  ],
  [
    'Pantry',
    /passata|paste|tinned|canned|flour|rice|pasta|lasagna|sugar|salt|pepper|oil|honey|spice|grain|cereal|nutmeg|pantry|despensa|arroz|harina|miel/,
  ],
  ['Bakery', /bread|bakery|bagel|croissant|tortilla|panadería/],
  [
    'Fruit & vegetables',
    /fruit|vegetable|tomato|onion|shallot|garlic|potato|carrot|apple|banana|lettuce|spinach|basil|herb|lemon|fruta|verdura|tomate|cebolla/,
  ],
];
export function departmentFor(name: string, category = ''): Department {
  if ((DEPARTMENTS as readonly string[]).includes(category)) return category as Department;
  return (
    rules.find(([, expression]) => expression.test(`${name} ${category}`.toLowerCase()))?.[0] ??
    'Other'
  );
}
export function departmentColor(department: string): string {
  if (department === 'Fruit & vegetables') return 'var(--color-mint)';
  if (department === 'Dairy & eggs') return 'var(--color-lavender)';
  if (department === 'Frozen' || department === 'Drinks') return 'var(--color-sky)';
  return 'var(--color-peach)';
}
