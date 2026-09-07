import type { InventoryItem, InventoryGroup } from '../../domain/inventory/types';
import type { Recipe } from '../recipes/recipes';
import type { MealPlan } from '../meal-plans/meal-plans';

export interface ShoppingData {
  batches?: import('@pantry/domain').CookingBatch[];
  items: InventoryItem[];
  groups: InventoryGroup[];
  recipes: Recipe[];
  plans: MealPlan[];
}
