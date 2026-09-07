import type { Department } from '../../components/InventoryList/departments';
export { DEPARTMENTS, departmentFor } from '../../components/InventoryList/departments';
export type { Department } from '../../components/InventoryList/departments';

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
