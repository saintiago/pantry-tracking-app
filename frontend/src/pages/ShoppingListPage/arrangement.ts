import type { ShoppingLine } from './companion';
import { DEPARTMENTS } from './departments';
import { suggestedProductIcon } from '../../components/InventoryList/icons';
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
export function shoppingIcon(line: Pick<ShoppingLine, 'name' | 'department' | 'icon'>): string {
  return suggestedProductIcon(line.name, line.department, line.icon);
}
