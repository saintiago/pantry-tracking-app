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
const colors: Record<Department, string> = {
  'Fruit & vegetables': '#E3F0D5',
  'Meat & fish': '#F8DEDC',
  'Dairy & eggs': '#FFF2CE',
  Bakery: '#F3E3CA',
  Pantry: '#EDDFCF',
  Frozen: '#E1F1FA',
  Drinks: '#E3E9FA',
  Household: '#DFF0EA',
  'Personal care': '#EDE3F3',
  Baby: '#F8E5ED',
  Pets: '#EAE2D8',
  Other: '#EDEEF0',
};

export function departmentColor(department: string): string {
  return colors[department as Department] ?? colors.Other;
}
