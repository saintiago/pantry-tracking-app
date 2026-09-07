import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { RecipeIngredient } from '@pantry/domain';
import { InventoryRepository } from '../../inventory/repository';
export async function autoCreateMissingIngredients(
  client: DynamoDBDocumentClient,
  table: string,
  userId: string,
  ingredients: RecipeIngredient[],
) {
  const inventory = new InventoryRepository(client, table);
  for (const ingredient of ingredients)
    await inventory.ensurePlaceholder(userId, ingredient.name, ingredient.unit);
}
