import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { VALID_UNITS } from '../types/units';

const TABLE_NAME = process.env.TABLE_NAME ?? 'PantryApp';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET ?? '';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function getUserId(event: APIGatewayProxyEvent): string | null {
  return (
    event.requestContext.authorizer?.claims?.sub ??
    event.requestContext.authorizer?.sub ??
    null
  );
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

const REQUIRED_FIELDS = ['name', 'category', 'expirationDate', 'locationId', 'quantity', 'unit'];

function validateAddRequest(
  parsed: Record<string, unknown>,
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];

  for (const field of REQUIRED_FIELDS) {
    const value = parsed[field];
    if (value === undefined || value === null || value === '') {
      errors.push({ field, message: `${field} is required` });
    }
  }

  if (typeof parsed.quantity === 'number' && parsed.quantity < 0) {
    errors.push({ field: 'quantity', message: 'quantity must be non-negative' });
  }

  if (parsed.expirationDate && typeof parsed.expirationDate === 'string') {
    const date = new Date(parsed.expirationDate);
    if (isNaN(date.getTime())) {
      errors.push({ field: 'expirationDate', message: 'expirationDate must be a valid ISO date' });
    }
  }

  if (
    parsed.unit !== undefined &&
    parsed.unit !== null &&
    parsed.unit !== '' &&
    !VALID_UNITS.includes(parsed.unit as string as typeof VALID_UNITS[number])
  ) {
    errors.push({ field: 'unit', message: `unit must be one of: ${VALID_UNITS.join(', ')}` });
  }

  return errors;
}

async function getLowStockItems(userId: string): Promise<APIGatewayProxyResult> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: 'isLowStock = :true',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'ITEM#',
        ':true': true,
      },
    }),
  );

  return response(200, { items: result.Items ?? [] });
}

async function listInventory(
  userId: string,
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const limit = event.queryStringParameters?.limit
    ? parseInt(event.queryStringParameters.limit, 10)
    : 50;
  const exclusiveStartKey = event.queryStringParameters?.lastEvaluatedKey
    ? JSON.parse(decodeURIComponent(event.queryStringParameters.lastEvaluatedKey))
    : undefined;

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'ITEM#',
      },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  const items = result.Items ?? [];
  const responseBody: Record<string, unknown> = { items };

  if (result.LastEvaluatedKey) {
    responseBody.lastEvaluatedKey = encodeURIComponent(
      JSON.stringify(result.LastEvaluatedKey),
    );
  }

  return response(200, responseBody);
}

async function addInventoryItem(
  userId: string,
  body: string | null,
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Missing request body' });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }

  const errors = validateAddRequest(parsed);
  if (errors.length > 0) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'Missing required fields',
      details: errors,
    });
  }

  const now = new Date().toISOString();
  const itemId = randomUUID();
  const quantity = parsed.quantity as number;
  const threshold = parsed.threshold as number | undefined;
  const isLowStock = threshold !== undefined && quantity <= threshold;
  const category = parsed.category as string;
  const locationId = parsed.locationId as string;

  // Build the pictureUrl — if a pictureUrl is provided, store the S3 reference
  let pictureUrl = parsed.pictureUrl as string | undefined;
  if (pictureUrl && STORAGE_BUCKET) {
    // If the pictureUrl is not already an S3 URL, treat it as an S3 key reference
    if (!pictureUrl.startsWith('s3://') && !pictureUrl.startsWith('https://')) {
      pictureUrl = `s3://${STORAGE_BUCKET}/inventory-items/${userId}/${itemId}`;
    }
  }

  const item: Record<string, unknown> = {
    PK: `USER#${userId}`,
    SK: `ITEM#${itemId}`,
    entityType: 'InventoryItem',
    itemId,
    userId,
    name: parsed.name,
    category,
    expirationDate: parsed.expirationDate,
    location: locationId,
    quantity,
    unit: parsed.unit,
    isLowStock,
    createdAt: now,
    updatedAt: now,
    syncVersion: 1,
    // GSI1: low-stock items use LOWSTOCK key, others use category key
    GSI1PK: isLowStock ? `USER#${userId}#LOWSTOCK` : `USER#${userId}#CAT#${category}`,
    GSI1SK: `ITEM#${itemId}`,
  };

  // Optional fields
  if (parsed.barcode !== undefined) item.barcode = parsed.barcode;
  if (parsed.brand !== undefined) item.brand = parsed.brand;
  if (parsed.whereToBuy !== undefined) item.whereToBuy = parsed.whereToBuy;
  if (parsed.onlineStoreLink !== undefined) item.onlineStoreLink = parsed.onlineStoreLink;
  if (pictureUrl !== undefined) item.pictureUrl = pictureUrl;
  if (threshold !== undefined) item.threshold = threshold;

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  return response(201, { item });
}

async function updateInventoryItem(
  userId: string,
  itemId: string,
  body: string | null,
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Missing request body' });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }

  if (Object.keys(parsed).length === 0) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'No fields to update' });
  }

  if (
    parsed.unit !== undefined &&
    !VALID_UNITS.includes(parsed.unit as string as typeof VALID_UNITS[number])
  ) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'Invalid unit value',
      details: [{ field: 'unit', message: `unit must be one of: ${VALID_UNITS.join(', ')}` }],
    });
  }

  const now = new Date().toISOString();

  // Build dynamic update expression
  const expressionAttrNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const expressionAttrValues: Record<string, unknown> = { ':now': now, ':inc': 1 };
  const updateParts: string[] = ['#updatedAt = :now', 'syncVersion = syncVersion + :inc'];

  const UPDATABLE_FIELDS: Record<string, string> = {
    name: 'name',
    category: 'category',
    expirationDate: 'expirationDate',
    locationId: 'location',
    quantity: 'quantity',
    unit: 'unit',
    barcode: 'barcode',
    brand: 'brand',
    whereToBuy: 'whereToBuy',
    onlineStoreLink: 'onlineStoreLink',
    pictureUrl: 'pictureUrl',
    threshold: 'threshold',
  };

  for (const [requestField, dbField] of Object.entries(UPDATABLE_FIELDS)) {
    if (parsed[requestField] !== undefined) {
      const alias = `#f_${requestField}`;
      const valAlias = `:v_${requestField}`;
      expressionAttrNames[alias] = dbField;
      expressionAttrValues[valAlias] = parsed[requestField];
      updateParts.push(`${alias} = ${valAlias}`);
    }
  }

  // Recalculate isLowStock if quantity or threshold changes
  // We need the current item to merge with updates
  const needsLowStockRecalc =
    parsed.quantity !== undefined || parsed.threshold !== undefined;

  let lowStockTransition = false;

  if (needsLowStockRecalc) {
    // Fetch current item to get existing quantity/threshold
    const current = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `ITEM#${itemId}` },
      }),
    );

    if (!current.Item) {
      return response(404, { error: 'NOT_FOUND', message: 'Inventory item not found' });
    }

    const wasLowStock = current.Item.isLowStock === true;
    const newQuantity =
      parsed.quantity !== undefined ? (parsed.quantity as number) : (current.Item.quantity as number);
    const newThreshold =
      parsed.threshold !== undefined
        ? (parsed.threshold as number | undefined)
        : (current.Item.threshold as number | undefined);
    const newCategory =
      parsed.category !== undefined
        ? (parsed.category as string)
        : (current.Item.category as string);

    const isLowStock = newThreshold !== undefined && newQuantity <= newThreshold;
    expressionAttrNames['#isLowStock'] = 'isLowStock';
    expressionAttrValues[':v_isLowStock'] = isLowStock;
    updateParts.push('#isLowStock = :v_isLowStock');

    // Detect transition to low-stock for in-app notification
    if (!wasLowStock && isLowStock) {
      lowStockTransition = true;
    }

    // Update GSI1PK based on low-stock status
    expressionAttrNames['#gsi1pk'] = 'GSI1PK';
    expressionAttrValues[':v_gsi1pk'] = isLowStock
      ? `USER#${userId}#LOWSTOCK`
      : `USER#${userId}#CAT#${newCategory}`;
    updateParts.push('#gsi1pk = :v_gsi1pk');

    expressionAttrNames['#gsi1sk'] = 'GSI1SK';
    expressionAttrValues[':v_gsi1sk'] = `ITEM#${itemId}`;
    updateParts.push('#gsi1sk = :v_gsi1sk');
  }

  // Update GSI1PK/GSI1SK if category changes (and not already handled by low-stock recalc)
  if (parsed.category !== undefined && !needsLowStockRecalc) {
    expressionAttrNames['#gsi1pk'] = 'GSI1PK';
    expressionAttrValues[':v_gsi1pk'] = `USER#${userId}#CAT#${parsed.category}`;
    updateParts.push('#gsi1pk = :v_gsi1pk');

    expressionAttrNames['#gsi1sk'] = 'GSI1SK';
    expressionAttrValues[':v_gsi1sk'] = `ITEM#${itemId}`;
    updateParts.push('#gsi1sk = :v_gsi1sk');
  }

  const updateExpression = `SET ${updateParts.join(', ')}`;

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `ITEM#${itemId}` },
        UpdateExpression: updateExpression,
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: expressionAttrNames,
        ExpressionAttributeValues: expressionAttrValues,
        ReturnValues: 'ALL_NEW',
      }),
    );

    const responseBody: Record<string, unknown> = { item: result.Attributes };
    if (lowStockTransition) {
      responseBody.lowStockTransition = true;
      responseBody.notification = {
        type: 'LOW_STOCK',
        message: `${result.Attributes?.name ?? 'Item'} is running low on stock`,
        itemId,
      };
    }

    return response(200, responseBody);
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return response(404, { error: 'NOT_FOUND', message: 'Inventory item not found' });
    }
    throw err;
  }
}

// --- Barcode Lookup ---

interface ProductInfo {
  name: string;
  brand?: string;
  category?: string;
}

const barcodeCache = new Map<string, { product: ProductInfo; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function barcodeLookup(
  _userId: string,
  body: string | null,
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Missing request body' });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }

  const barcode = parsed.barcode;
  if (typeof barcode !== 'string' || barcode.trim() === '') {
    return response(400, { error: 'VALIDATION_ERROR', message: 'barcode is required' });
  }

  const trimmedBarcode = barcode.trim();

  // Check cache
  const cached = barcodeCache.get(trimmedBarcode);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return response(200, { found: true, product: cached.product });
  }

  // Evict stale entry if present
  if (cached) {
    barcodeCache.delete(trimmedBarcode);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const apiRes = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(trimmedBarcode)}`,
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    if (!apiRes.ok) {
      return response(200, { found: false });
    }

    const data = (await apiRes.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        brands?: string;
        categories_tags?: string[];
      };
    };

    if (!data.product || data.status === 0 || !data.product.product_name) {
      return response(200, { found: false });
    }

    const product: ProductInfo = {
      name: data.product.product_name,
      brand: data.product.brands || undefined,
      category: data.product.categories_tags?.[0] || undefined,
    };

    barcodeCache.set(trimmedBarcode, { product, timestamp: Date.now() });

    return response(200, { found: true, product });
  } catch (err) {
    console.error('Barcode lookup error:', err);
    return response(200, { found: false });
  }
}

// --- Inventory Search ---

interface InventorySearchResponse {
  field: string;
  query: string;
  resultType: 'items' | 'values';
  items?: unknown[];
  values?: string[];
  count: number;
}

async function searchInventory(
  userId: string,
  field: string,
  query: string,
): Promise<APIGatewayProxyResult> {
  if (!field || !query) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'field and query parameters are required',
    });
  }

  const validFields = ['barcode', 'name', 'category', 'brand', 'whereToBuy', 'onlineStoreLink'];
  if (!validFields.includes(field)) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: `field must be one of: ${validFields.join(', ')}`,
    });
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery === '') {
    return response(400, { error: 'VALIDATION_ERROR', message: 'query cannot be empty' });
  }

  try {
    // Full item searches (barcode, name)
    if (field === 'barcode') {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          FilterExpression: 'contains(barcode, :query)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':skPrefix': 'ITEM#',
            ':query': trimmedQuery,
          },
          Limit: 10,
        }),
      );

      const items = result.Items ?? [];
      return response(200, {
        field,
        query: trimmedQuery,
        resultType: 'items',
        items,
        count: items.length,
      } as InventorySearchResponse);
    }

    if (field === 'name') {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':skPrefix': 'ITEM#',
          },
        }),
      );

      const allItems = result.Items ?? [];
      const lowerQuery = trimmedQuery.toLowerCase();
      const matchingItems = allItems
        .filter((item) => {
          const name = item.name as string;
          return name && name.toLowerCase().includes(lowerQuery);
        })
        .slice(0, 10);

      return response(200, {
        field,
        query: trimmedQuery,
        resultType: 'items',
        items: matchingItems,
        count: matchingItems.length,
      } as InventorySearchResponse);
    }

    // Distinct value searches (category, brand, whereToBuy, onlineStoreLink)
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':skPrefix': 'ITEM#',
        },
      }),
    );

    const allItems = result.Items ?? [];
    const distinctValues = new Set<string>();

    for (const item of allItems) {
      const value = item[field];
      if (value && typeof value === 'string' && value.trim() !== '') {
        distinctValues.add(value);
      }
    }

    const lowerQuery = trimmedQuery.toLowerCase();
    const matchingValues = Array.from(distinctValues)
      .filter((value) => value.toLowerCase().includes(lowerQuery))
      .slice(0, 10);

    return response(200, {
      field,
      query: trimmedQuery,
      resultType: 'values',
      values: matchingValues,
      count: matchingValues.length,
    } as InventorySearchResponse);
  } catch (err) {
    console.error('Inventory search error:', err);
    return response(500, {
      error: 'INTERNAL_ERROR',
      message: 'Failed to search inventory',
    });
  }
}

async function deleteInventoryItem(
  userId: string,
  itemId: string,
): Promise<APIGatewayProxyResult> {
  // Verify item exists before deleting
  const existing = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `ITEM#${itemId}` },
    }),
  );

  if (!existing.Item) {
    return response(404, { error: 'NOT_FOUND', message: 'Inventory item not found' });
  }

  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `ITEM#${itemId}` },
    }),
  );

  return response(200, { message: 'Inventory item deleted' });
}

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const userId = getUserId(event);
  if (!userId) {
    return response(401, { error: 'UNAUTHORIZED', message: 'Missing authentication' });
  }

  const method = event.httpMethod;
  const itemId = event.pathParameters?.itemId ?? null;
  const path = event.resource ?? event.path ?? '';

  try {
    if (method === 'GET' && path.endsWith('/low-stock')) {
      return await getLowStockItems(userId);
    }

    if (method === 'GET' && path.endsWith('/search')) {
      const field = event.queryStringParameters?.field ?? '';
      const query = event.queryStringParameters?.query ?? '';
      return await searchInventory(userId, field, query);
    }

    if (method === 'GET' && !itemId) {
      return await listInventory(userId, event);
    }

    if (method === 'POST' && path.endsWith('/barcode-lookup')) {
      return await barcodeLookup(userId, event.body);
    }

    if (method === 'POST' && !itemId) {
      return await addInventoryItem(userId, event.body);
    }

    if (method === 'PUT' && itemId) {
      return await updateInventoryItem(userId, itemId, event.body);
    }

    if (method === 'DELETE' && itemId) {
      return await deleteInventoryItem(userId, itemId);
    }

    return response(405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  } catch (err) {
    console.error('Inventory Lambda error:', err);
    return response(500, {
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: event.requestContext.requestId,
    });
  }
}
