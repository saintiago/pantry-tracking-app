import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const TABLE_NAME = process.env.TABLE_NAME ?? 'PantryApp';

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

async function listLocations(userId: string): Promise<APIGatewayProxyResult> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'LOCATION#',
      },
    }),
  );

  let locations = (result.Items ?? []).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
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
      createdAt: now,
      updatedAt: now,
      syncVersion: 1,
    };

    await docClient.send(
      new PutCommand({ TableName: TABLE_NAME, Item: defaultLocation }),
    );

    locations = [defaultLocation];
  }

  return response(200, { locations });
}

async function createLocation(
  userId: string,
  body: string | null,
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Missing request body' });
  }

  let parsed: { name?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }

  const name = parsed.name?.trim();
  if (!name) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Name is required' });
  }

  // Check for duplicate name (case-insensitive)
  const existing = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'LOCATION#',
      },
    }),
  );

  const duplicate = (existing.Items ?? []).some(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );

  if (duplicate) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'A storage location with this name already exists',
    });
  }

  const now = new Date().toISOString();
  const locationId = randomUUID();
  const location = {
    PK: `USER#${userId}`,
    SK: `LOCATION#${locationId}`,
    entityType: 'StorageLocation',
    locationId,
    userId,
    name,
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

  let parsed: { name?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }

  const name = parsed.name?.trim();
  if (!name) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Name is required' });
  }

  // Check for duplicate name (case-insensitive), excluding the current location
  const existing = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'LOCATION#',
      },
    }),
  );

  const duplicate = (existing.Items ?? []).some(
    (item) => item.locationId !== locationId && item.name.toLowerCase() === name.toLowerCase(),
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
        UpdateExpression: 'SET #n = :name, updatedAt = :now, syncVersion = syncVersion + :inc',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: { ':name': name, ':now': now, ':inc': 1 },
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

async function deleteLocation(
  userId: string,
  locationId: string,
): Promise<APIGatewayProxyResult> {
  // Check if location exists and count total locations
  const locations = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'LOCATION#',
      },
    }),
  );

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
  const inventoryCheck = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: {
        ':gsi1pk': `USER#${userId}#LOC#${locationId}`,
      },
      Limit: 1,
    }),
  );

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

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
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
