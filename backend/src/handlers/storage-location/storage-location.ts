import { queryAll } from '../../db/query';
import { parseObject } from '../../http/request';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const TABLE_NAME = process.env.TABLE_NAME ?? 'PantryApp';
const LOCATION_COLORS = [
  '#E3F0D5',
  '#E1F1FA',
  '#FFF2CE',
  '#F8DEDC',
  '#EDE3F3',
  '#DFF0EA',
  '#F3E3CA',
  '#E3E9FA',
] as const;
const LOCATION_COLOR_SET = new Set<string>(LOCATION_COLORS);

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

import { getUserId, response } from '../../http/response';

function locationColor(value: unknown, index: number): string | null {
  if (value === undefined || value === null || value === '')
    return LOCATION_COLORS[index % LOCATION_COLORS.length];
  if (typeof value !== 'string' || !LOCATION_COLOR_SET.has(value)) return null;
  return value;
}

async function listLocations(userId: string): Promise<APIGatewayProxyResult> {
  const result = await queryAll(docClient, {
    TableName: TABLE_NAME,
    ConsistentRead: true,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'LOCATION#',
    },
  });

  let locations = (result.Items ?? []).sort(
    (a, b) => new Date(String(a.createdAt)).getTime() - new Date(String(b.createdAt)).getTime(),
  );

  // Auto-create default "Pantry" location on first access
  if (locations.length === 0) {
    const now = new Date().toISOString();
    const locationId = randomUUID();
    const defaultLocation = {
      PK: `USER#${userId}`,
      SK: `LOCATION#${locationId}`,
      entityType: 'StorageLocation',
      locationId,
      userId,
      name: 'Pantry',
      color: LOCATION_COLORS[0],
      createdAt: now,
      updatedAt: now,
      syncVersion: 1,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: defaultLocation }));

    locations = [defaultLocation];
  }

  return response(200, { locations });
}

async function createLocation(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Missing request body' });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseObject(body);
  } catch {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }

  const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
  if (!name) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Name is required' });
  }

  // Check for duplicate name (case-insensitive)
  const existing = await queryAll(docClient, {
    TableName: TABLE_NAME,
    ConsistentRead: true,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'LOCATION#',
    },
  });

  const duplicate = (existing.Items ?? []).some(
    (item) => String(item.name).toLowerCase() === name.toLowerCase(),
  );

  if (duplicate) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'A storage location with this name already exists',
    });
  }

  const now = new Date().toISOString();
  const locationId = randomUUID();
  const color = locationColor(parsed.color, existing.Items?.length ?? 0);
  if (!color) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Choose a supported pastel color' });
  }
  const location = {
    PK: `USER#${userId}`,
    SK: `LOCATION#${locationId}`,
    entityType: 'StorageLocation',
    locationId,
    userId,
    name,
    color,
    createdAt: now,
    updatedAt: now,
    syncVersion: 1,
  };

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: location }));

  return response(201, { location });
}

async function renameLocation(
  userId: string,
  locationId: string,
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

  const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
  if (!name) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Name is required' });
  }
  // Check for duplicate name (case-insensitive), excluding the current location
  const existing = await queryAll(docClient, {
    TableName: TABLE_NAME,
    ConsistentRead: true,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'LOCATION#',
    },
  });

  const current = (existing.Items ?? []).find((item) => item.locationId === locationId);
  const color =
    parsed.color === undefined
      ? (current?.color as string | undefined)
      : locationColor(parsed.color, 0);
  if (parsed.color !== undefined && !color) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Choose a supported pastel color' });
  }

  const duplicate = (existing.Items ?? []).some(
    (item) =>
      item.locationId !== locationId && String(item.name).toLowerCase() === name.toLowerCase(),
  );

  if (duplicate) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'A storage location with this name already exists',
    });
  }

  const now = new Date().toISOString();

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `LOCATION#${locationId}` },
        UpdateExpression:
          'SET #n = :name, color = :color, updatedAt = :now, syncVersion = syncVersion + :inc',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: {
          ':name': name,
          ':color': color ?? LOCATION_COLORS[0],
          ':now': now,
          ':inc': 1,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    return response(200, { location: result.Attributes });
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return response(404, { error: 'NOT_FOUND', message: 'Storage location not found' });
    }
    throw err;
  }
}

async function deleteLocation(userId: string, locationId: string): Promise<APIGatewayProxyResult> {
  // Check if location exists and count total locations
  const locations = await queryAll(docClient, {
    TableName: TABLE_NAME,
    ConsistentRead: true,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'LOCATION#',
    },
  });

  const locationItems = locations.Items ?? [];
  const target = locationItems.find((item) => item.locationId === locationId);

  if (!target) {
    return response(404, { error: 'NOT_FOUND', message: 'Storage location not found' });
  }

  // Guard: cannot delete last remaining location
  if (locationItems.length <= 1) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'Cannot remove the last remaining storage location',
    });
  }

  // Guard: cannot delete location that contains inventory items
  const inventoryCheck = await queryAll(docClient, {
    TableName: TABLE_NAME,
    ConsistentRead: true,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression: '#location = :location',
    ExpressionAttributeNames: { '#location': 'location' },
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'ITEM#',
      ':location': locationId,
    },
  });

  if ((inventoryCheck.Items ?? []).length > 0) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'Cannot remove a storage location that contains inventory items',
    });
  }

  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `LOCATION#${locationId}` },
    }),
  );

  return response(200, { message: 'Storage location deleted' });
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = getUserId(event);
  if (!userId) {
    return response(401, { error: 'UNAUTHORIZED', message: 'Missing authentication' });
  }

  const method = event.httpMethod;
  const locationId = event.pathParameters?.locationId ?? null;

  try {
    if (method === 'GET' && !locationId) {
      return await listLocations(userId);
    }

    if (method === 'POST' && !locationId) {
      return await createLocation(userId, event.body);
    }

    if (method === 'PUT' && locationId) {
      return await renameLocation(userId, locationId, event.body);
    }

    if (method === 'DELETE' && locationId) {
      return await deleteLocation(userId, locationId);
    }

    return response(405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  } catch (err) {
    console.error('Storage Location Lambda error:', err);
    return response(500, {
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: event.requestContext.requestId,
    });
  }
}
