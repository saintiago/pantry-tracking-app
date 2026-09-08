import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { queryAll } from '../../db/query';
import { parseObject } from '../../http/request';
import { response } from '../../http/response';
import { validateRecipeImages } from './recipe-images';
import type { Cookbook } from '@pantry/domain';

export function validateCookbook(value: Record<string, unknown>): string | null {
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 200)
    return 'Enter a cookbook name (up to 200 characters).';
  if (typeof value.description !== 'string' || value.description.length > 2000)
    return 'Cookbook description must be at most 2000 characters.';
  if (
    !Array.isArray(value.recipeIds) ||
    value.recipeIds.length > 500 ||
    value.recipeIds.some((id) => typeof id !== 'string' || !id || id.length > 100)
  )
    return 'Choose up to 500 recipes for a cookbook.';
  return validateRecipeImages({ imageId: value.imageId });
}
export async function cookbookRequest(
  client: DynamoDBDocumentClient,
  table: string,
  userId: string,
  method: string,
  id: string | undefined,
  body: string | null,
) {
  const PK = `USER#${userId}`;
  if (id && !/^[a-zA-Z0-9-]{1,100}$/.test(id))
    return response(400, { message: 'Invalid cookbook ID' });
  if (method === 'GET' && !id) {
    const result = await queryAll(client, {
      TableName: table,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': PK, ':sk': 'COOKBOOK#' },
      ConsistentRead: true,
    });
    return response(200, {
      cookbooks: (result.Items ?? []).map(
        ({ PK: _pk, SK: _sk, entityType: _type, ...book }) => book,
      ),
    });
  }
  if (!['POST', 'PUT', 'DELETE'].includes(method) || (method === 'POST' ? !!id : !id))
    return response(405, { message: 'Method not allowed' });
  let value: Record<string, unknown>;
  try {
    value = parseObject(body ?? '');
  } catch {
    return response(400, { message: 'Invalid JSON body' });
  }
  if (method !== 'DELETE') {
    const error = validateCookbook(value);
    if (error) return response(400, { message: error });
  }
  if (method !== 'POST' && (!Number.isSafeInteger(value.version) || Number(value.version) < 1))
    return response(400, { message: 'A cookbook version is required.' });
  const cookbookId = id ?? randomUUID();
  const Key = { PK, SK: `COOKBOOK#${cookbookId}` };
  const existing = id
    ? (await client.send(new GetCommand({ TableName: table, Key, ConsistentRead: true }))).Item
    : undefined;
  if (id && !existing) return response(404, { message: 'Cookbook not found' });
  const guard =
    method === 'POST'
      ? { ConditionExpression: 'attribute_not_exists(PK)' }
      : {
          ConditionExpression: '#version = :version',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':version': value.version },
        };
  try {
    if (method === 'DELETE') {
      await client.send(new DeleteCommand({ TableName: table, Key, ...guard }));
      return response(200, { message: 'Cookbook removed. Recipes were kept.' });
    }
    const now = new Date().toISOString();
    const book: Cookbook = {
      cookbookId,
      name: (value.name as string).trim(),
      description: (value.description as string).trim(),
      recipeIds: [...new Set(value.recipeIds as string[])],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      version: method === 'POST' ? 1 : Number(value.version) + 1,
      ...(value.imageId ? { imageId: value.imageId as string } : {}),
    };
    await client.send(
      new PutCommand({
        TableName: table,
        Item: { ...Key, ...book, entityType: 'Cookbook' },
        ...guard,
      }),
    );
    return response(method === 'POST' ? 201 : 200, book);
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException')
      return response(409, {
        message: 'This cookbook changed on another device. Reload it before saving.',
      });
    throw error;
  }
}
