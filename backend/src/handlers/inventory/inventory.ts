import { queryAll } from '../../db/query';
import { validateAddRequest, validateInventoryFields } from './inventory-validation';
import { parseObject, inventoryCursor } from '../../http/request';
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
import { VALID_UNITS, LEGACY_UNIT_MAP } from '../../types/units';
import {
  calculateLowStock,
  convertThreshold,
  canonicalGroupKey,
  canonicalUnit,
  defaultGroupId,
  stripDatabaseKeys,
} from './inventory-groups';

const ACCEPTED_UNITS = new Set([...VALID_UNITS, ...Object.keys(LEGACY_UNIT_MAP)]);

/**
 * Mutation response for POST/PUT inventory routes.
 * See `docs/architecture/data-model.md`.
 */
interface MutationResponse {
  item: unknown;
  groups?: unknown[];
  lowStockTransition?: boolean;
  notification?: { type: string; message: string; groupId: string };
}

const TABLE_NAME = process.env.TABLE_NAME ?? 'PantryApp';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET ?? '';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

import { getUserId, response } from '../../http/response';

async function getLowStockItems(userId: string): Promise<APIGatewayProxyResult> {
  const result = await queryAll(docClient, {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression: 'isLowStock = :true',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'GROUP#',
      ':true': true,
    },
  });

  return response(200, { groups: (result.Items ?? []).map(stripDatabaseKeys) });
}

async function getGroup(
  userId: string,
  groupId: string,
): Promise<Record<string, unknown> | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `GROUP#${groupId}` },
    }),
  );
  return result?.Item;
}

async function createGroup(
  userId: string,
  name: string,
  category: string,
  unit: string,
  initialQuantity: number,
): Promise<Record<string, unknown>> {
  const groupId = defaultGroupId(name, category, unit);
  const existing = await getGroup(userId, groupId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const group: Record<string, unknown> = {
    PK: `USER#${userId}`,
    SK: `GROUP#${groupId}`,
    entityType: 'InventoryGroup',
    groupId,
    canonicalKey: canonicalGroupKey(name, category, unit),
    name,
    category,
    unit: canonicalUnit(unit),
    totalQuantity: initialQuantity,
    isLowStock: false,
    createdAt: now,
    updatedAt: now,
    syncVersion: 1,
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: group }));
  return group;
}

async function adjustGroupQuantity(
  userId: string,
  groupId: string,
  delta: number,
): Promise<{ group?: Record<string, unknown>; lowStockTransition: boolean }> {
  const current = await getGroup(userId, groupId);
  if (!current) return { lowStockTransition: false };

  const oldLowStock = current.isLowStock === true;
  const totalQuantity = Math.max(0, Number(current.totalQuantity ?? 0) + delta);
  const threshold = typeof current.threshold === 'number' ? current.threshold : undefined;
  const isLowStock = calculateLowStock(
    totalQuantity,
    threshold,
    current.thresholdUnit as string | undefined,
    current.unit as string,
  );

  if (totalQuantity === 0 && threshold === undefined) {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `GROUP#${groupId}` },
      }),
    );
    return { lowStockTransition: false };
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `GROUP#${groupId}` },
      UpdateExpression:
        'SET totalQuantity = :total, isLowStock = :low, updatedAt = :now, syncVersion = syncVersion + :inc',
      ExpressionAttributeValues: {
        ':total': totalQuantity,
        ':low': isLowStock,
        ':now': new Date().toISOString(),
        ':inc': 1,
      },
      ReturnValues: 'ALL_NEW',
    }),
  );
  return { group: result.Attributes, lowStockTransition: !oldLowStock && isLowStock };
}

async function listInventory(
  userId: string,
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const limit = Number(event.queryStringParameters?.limit ?? 50);
  let exclusiveStartKey;
  try {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid limit');
    exclusiveStartKey = inventoryCursor(event.queryStringParameters?.lastEvaluatedKey, userId);
  } catch {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Invalid inventory pagination' });
  }

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
  const allGroups: Record<string, unknown>[] = [];
  let groupCursor: Record<string, unknown> | undefined;
  do {
    const groupResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':skPrefix': 'GROUP#' },
        ...(groupCursor ? { ExclusiveStartKey: groupCursor } : {}),
      }),
    );
    allGroups.push(...(groupResult?.Items ?? []));
    groupCursor = groupResult?.LastEvaluatedKey;
  } while (groupCursor);
  const responseBody: Record<string, unknown> = {
    items: items.map(stripDatabaseKeys),
    groups: allGroups.map(stripDatabaseKeys),
  };

  if (result.LastEvaluatedKey) {
    responseBody.lastEvaluatedKey = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
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
    parsed = parseObject(body);
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

  const quantity = parsed.quantity as number;
  return await createInventoryItem(userId, parsed, quantity);
}

/**
 * Creates a new inventory item and returns a 201 mutation response flagged as a
 * creation (`merged: false`). Builds the GSI1 key from the low-stock state
 * (LOWSTOCK vs CAT key) consistent with `updateInventoryItem`.
 */
async function createInventoryItem(
  userId: string,
  parsed: Record<string, unknown>,
  quantity: number,
): Promise<APIGatewayProxyResult> {
  const now = new Date().toISOString();
  const itemId = randomUUID();
  const category = parsed.category as string;
  const locationId = parsed.locationId as string;
  const name = parsed.name as string;
  const unit = parsed.unit as string;
  const groupId = defaultGroupId(name, category, unit);
  const existingGroup = await getGroup(userId, groupId);
  const group = existingGroup ?? (await createGroup(userId, name, category, unit, quantity));

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
    groupId,
    userId,
    name: parsed.name,
    category,
    expirationDate: parsed.expirationDate,
    location: locationId,
    quantity,
    unit: parsed.unit,
    createdAt: now,
    updatedAt: now,
    syncVersion: 1,
    GSI1PK: `USER#${userId}#CAT#${category}`,
    GSI1SK: `ITEM#${itemId}`,
  };

  // Optional fields
  if (parsed.barcode !== undefined) item.barcode = parsed.barcode;
  if (parsed.brand !== undefined) item.brand = parsed.brand;
  if (parsed.whereToBuy !== undefined) item.whereToBuy = parsed.whereToBuy;
  if (parsed.onlineStoreLink !== undefined) item.onlineStoreLink = parsed.onlineStoreLink;
  if (pictureUrl !== undefined) item.pictureUrl = pictureUrl;
  if (parsed.locationDetails !== undefined) item.locationDetails = parsed.locationDetails;
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  const groupChange = existingGroup
    ? await adjustGroupQuantity(userId, groupId, quantity)
    : { group, lowStockTransition: false };

  const responseBody: MutationResponse = {
    item: stripDatabaseKeys(item),
    groups: [stripDatabaseKeys(groupChange.group ?? group)],
  };
  if (groupChange.lowStockTransition) {
    responseBody.lowStockTransition = true;
    responseBody.notification = {
      type: 'LOW_STOCK',
      message: `${name} is running low on stock`,
      groupId,
    };
  }
  return response(201, responseBody);
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
    parsed = parseObject(body);
  } catch {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }

  if (parsed.locationDetails !== undefined && typeof parsed.locationDetails !== 'string') {
    return response(400, { error: 'VALIDATION_ERROR', message: 'locationDetails must be text' });
  }
  const fieldErrors = validateInventoryFields(parsed);
  if (fieldErrors.length)
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'Invalid inventory fields',
      details: fieldErrors,
    });
  if (Object.keys(parsed).length === 0) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'No fields to update' });
  }

  if (parsed.unit !== undefined && !ACCEPTED_UNITS.has(parsed.unit as string)) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'Invalid unit value',
      details: [{ field: 'unit', message: `unit must be one of: ${VALID_UNITS.join(', ')}` }],
    });
  }

  if (
    parsed.quantity !== undefined &&
    (typeof parsed.quantity !== 'number' || parsed.quantity < 0)
  ) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'quantity must be non-negative' });
  }

  const currentResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `ITEM#${itemId}` },
    }),
  );
  const current = currentResult.Item;
  if (!current) {
    return response(404, { error: 'NOT_FOUND', message: 'Inventory item not found' });
  }

  const oldGroupId =
    typeof current.groupId === 'string'
      ? current.groupId
      : defaultGroupId(current.name as string, current.category as string, current.unit as string);
  const oldQuantity = Number(current.quantity);
  const newQuantity = parsed.quantity !== undefined ? Number(parsed.quantity) : oldQuantity;
  const newName = (parsed.name ?? current.name) as string;
  const newCategory = (parsed.category ?? current.category) as string;
  const newUnit = (parsed.unit ?? current.unit) as string;
  const shouldReassign = parsed.reassignGroup === true;
  const targetGroupId = shouldReassign ? defaultGroupId(newName, newCategory, newUnit) : oldGroupId;
  let targetGroup = await getGroup(userId, targetGroupId);
  if (!targetGroup) {
    targetGroup = await createGroup(userId, newName, newCategory, newUnit, 0);
  }

  const now = new Date().toISOString();
  const expressionAttrNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const expressionAttrValues: Record<string, unknown> = { ':now': now, ':inc': 1 };
  const updateParts: string[] = ['#updatedAt = :now', 'syncVersion = syncVersion + :inc'];

  const UPDATABLE_FIELDS: Record<string, string> = {
    name: 'name',
    category: 'category',
    expirationDate: 'expirationDate',
    locationId: 'location',
    locationDetails: 'locationDetails',
    quantity: 'quantity',
    unit: 'unit',
    barcode: 'barcode',
    brand: 'brand',
    whereToBuy: 'whereToBuy',
    onlineStoreLink: 'onlineStoreLink',
    pictureUrl: 'pictureUrl',
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
  if (targetGroupId !== oldGroupId) {
    expressionAttrNames['#groupId'] = 'groupId';
    expressionAttrValues[':groupId'] = targetGroupId;
    updateParts.push('#groupId = :groupId');
  }

  if (parsed.category !== undefined) {
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

    let groupChange: { group?: Record<string, unknown>; lowStockTransition: boolean };
    if (targetGroupId === oldGroupId) {
      groupChange = await adjustGroupQuantity(userId, oldGroupId, newQuantity - oldQuantity);
    } else {
      await adjustGroupQuantity(userId, oldGroupId, -oldQuantity);
      groupChange = await adjustGroupQuantity(userId, targetGroupId, newQuantity);
    }

    const updatedItem = result?.Attributes ?? {
      ...current,
      ...Object.fromEntries(
        Object.entries(parsed)
          .filter(([key]) => key !== 'reassignGroup' && key !== 'locationId')
          .map(([key, value]) => [key, value]),
      ),
      ...(parsed.locationId !== undefined ? { location: parsed.locationId } : {}),
      groupId: targetGroupId,
      updatedAt: now,
      syncVersion: Number(current.syncVersion ?? 0) + 1,
    };
    const responseBody: Record<string, unknown> = {
      item: stripDatabaseKeys(updatedItem),
      groups: groupChange.group ? [stripDatabaseKeys(groupChange.group)] : [],
    };
    if (groupChange.lowStockTransition) {
      responseBody.lowStockTransition = true;
      responseBody.notification = {
        type: 'LOW_STOCK',
        message: `${targetGroup.name ?? newName} is running low on stock`,
        groupId: targetGroupId,
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
    parsed = parseObject(body);
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

    // Pick the best category from categories_tags.
    // Tags look like "en:dairy-products", "fr:laits", "en:milks".
    // Prefer English tags, strip the locale prefix, convert slug to title case.
    const categoryTag = (() => {
      const tags = data.product.categories_tags ?? [];
      const enTag = tags.find((t) => t.startsWith('en:')) ?? tags[0];
      if (!enTag) return undefined;
      const slug = enTag.replace(/^[a-z]{2}:/, '');
      return slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    })();

    // brands can be comma-separated — take just the first one
    const brand = data.product.brands
      ? data.product.brands.split(',')[0].trim() || undefined
      : undefined;

    const product: ProductInfo = {
      name: data.product.product_name,
      brand,
      category: categoryTag,
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
    if (field === 'barcode' || field === 'name') {
      const allItems: Record<string, unknown>[] = [];
      let cursor: Record<string, unknown> | undefined;
      do {
        const result = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':skPrefix': 'ITEM#' },
            ...(cursor ? { ExclusiveStartKey: cursor } : {}),
          }),
        );
        allItems.push(...(result.Items ?? []));
        cursor = result.LastEvaluatedKey;
      } while (cursor);
      const seen = new Set<string>();
      const items = allItems
        .filter((item) =>
          String(item[field] ?? '')
            .toLowerCase()
            .includes(trimmedQuery.toLowerCase()),
        )
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        .filter((item) => {
          const key = item.barcode
            ? String(item.barcode)
            : canonicalGroupKey(String(item.name), String(item.category), String(item.unit));
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 10);
      return response(200, {
        field,
        query: trimmedQuery,
        resultType: 'items',
        items,
        count: items.length,
      });
    }

    // Distinct value searches (category, brand, whereToBuy, onlineStoreLink)
    // Also return matching items so callers can use them for autofill
    const result = await queryAll(docClient, {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'ITEM#',
      },
    });

    const allItems = result.Items ?? [];
    const lowerQuery = trimmedQuery.toLowerCase();

    // Collect matching items (where the field value matches the query)
    const matchingItems = allItems
      .filter((item) => {
        const value = item[field];
        return value && typeof value === 'string' && value.toLowerCase().includes(lowerQuery);
      })
      .slice(0, 10);

    // Also collect distinct matching values for backward compatibility
    const distinctValues = new Set<string>();
    for (const item of matchingItems) {
      const value = item[field];
      if (value && typeof value === 'string') distinctValues.add(value);
    }

    return response(200, {
      field,
      query: trimmedQuery,
      resultType: 'items',
      items: matchingItems,
      values: Array.from(distinctValues),
      count: matchingItems.length,
    } as InventorySearchResponse);
  } catch (err) {
    console.error('Inventory search error:', err);
    return response(500, {
      error: 'INTERNAL_ERROR',
      message: 'Failed to search inventory',
    });
  }
}

async function deleteInventoryItem(userId: string, itemId: string): Promise<APIGatewayProxyResult> {
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

  if (typeof existing.Item.groupId === 'string') {
    await adjustGroupQuantity(userId, existing.Item.groupId, -Number(existing.Item.quantity ?? 0));
  }

  return response(200, { message: 'Inventory item deleted' });
}

async function updateInventoryGroup(
  userId: string,
  groupId: string,
  body: string | null,
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Missing request body' });
  }
  let parsed: { threshold?: number | null; thresholdUnit?: string };
  try {
    parsed = parseObject(body);
  } catch {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }
  if (
    !parsed ||
    (parsed.threshold !== null &&
      (typeof parsed.threshold !== 'number' ||
        !Number.isFinite(parsed.threshold) ||
        parsed.threshold < 0))
  ) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'threshold must be a non-negative number or null',
    });
  }

  const current = await getGroup(userId, groupId);
  if (!current) {
    return response(404, { error: 'NOT_FOUND', message: 'Inventory group not found' });
  }
  const oldLowStock = current.isLowStock === true;
  const threshold = parsed.threshold === null ? undefined : parsed.threshold;
  const thresholdUnit = parsed.thresholdUnit ?? (current.unit as string);
  if (
    !ACCEPTED_UNITS.has(thresholdUnit) ||
    convertThreshold(1, thresholdUnit, current.unit as string) === null
  ) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'Threshold unit must be compatible with the stock unit',
    });
  }
  const isLowStock = calculateLowStock(
    Number(current.totalQuantity ?? 0),
    threshold,
    thresholdUnit,
    current.unit as string,
  );
  const names: Record<string, string> = { '#threshold': 'threshold' };
  const values: Record<string, unknown> = {
    ':low': isLowStock,
    ':now': new Date().toISOString(),
    ':inc': 1,
  };
  if (threshold !== undefined) {
    values[':threshold'] = threshold;
    values[':thresholdUnit'] = thresholdUnit;
  }
  const updateExpression =
    threshold === undefined
      ? 'SET isLowStock = :low, updatedAt = :now, syncVersion = syncVersion + :inc REMOVE #threshold, thresholdUnit'
      : 'SET #threshold = :threshold, thresholdUnit = :thresholdUnit, isLowStock = :low, updatedAt = :now, syncVersion = syncVersion + :inc';

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `GROUP#${groupId}` },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(PK)',
      ReturnValues: 'ALL_NEW',
    }),
  );
  const responseBody: Record<string, unknown> = {
    group: result.Attributes ? stripDatabaseKeys(result.Attributes) : undefined,
  };
  if (!oldLowStock && isLowStock) {
    responseBody.lowStockTransition = true;
    responseBody.notification = {
      type: 'LOW_STOCK',
      message: `${current.name ?? 'Item'} is running low on stock`,
      groupId,
    };
  }
  return response(200, responseBody);
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = getUserId(event);
  if (!userId) {
    return response(401, { error: 'UNAUTHORIZED', message: 'Missing authentication' });
  }

  const method = event.httpMethod;
  const itemId = event.pathParameters?.itemId ?? null;
  const groupId = event.pathParameters?.groupId ?? null;
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

    if (method === 'PUT' && groupId && path.includes('/groups/')) {
      return await updateInventoryGroup(userId, groupId, event.body);
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
