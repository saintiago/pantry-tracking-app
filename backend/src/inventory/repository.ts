import { randomUUID } from 'crypto';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { queryAll } from '../db/query';
import { resolveUnit } from '../types/units';
import {
  calculateLowStock,
  canonicalGroupKey,
  canonicalUnit,
  convertThreshold,
  defaultGroupId,
} from './groups';

export type InventoryRow = Record<string, unknown>;
type Write = NonNullable<TransactWriteCommandInput['TransactItems']>[number];
interface Snapshot {
  state?: InventoryRow;
  items: InventoryRow[];
  groups: InventoryRow[];
}
interface Change {
  item?: InventoryRow;
  groups: InventoryRow[];
  lowStockTransition: boolean;
  notificationGroup?: InventoryRow;
}
export class InventoryWriteError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function groupFor(item: InventoryRow): string {
  return typeof item.groupId === 'string'
    ? item.groupId
    : defaultGroupId(String(item.name), String(item.category), String(item.unit));
}

/** All inventory writers share this permanent per-account revision. Never delete/reset it. */
export class InventoryRepository {
  constructor(
    private client: DynamoDBDocumentClient,
    private table: string,
  ) {}

  private async query(userId: string, prefix: string) {
    return (
      (
        await queryAll(this.client, {
          TableName: this.table,
          ConsistentRead: true,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':prefix': prefix },
        })
      ).Items ?? []
    );
  }

  private put(row: InventoryRow): Write {
    return { Put: { TableName: this.table, Item: row } };
  }
  private remove(row: InventoryRow): Write {
    return { Delete: { TableName: this.table, Key: { PK: row.PK, SK: row.SK } } };
  }

  private async transact<T>(
    userId: string,
    plan: (snapshot: Snapshot) => Promise<{ writes: Write[]; result: T }>,
  ): Promise<T> {
    const key = { PK: `USER#${userId}`, SK: 'INVENTORY_STATE' };
    for (let attempt = 0; attempt < 8; attempt++) {
      const { Item: state } = await this.client.send(
        new GetCommand({ TableName: this.table, Key: key, ConsistentRead: true }),
      );
      if (state && (!Number.isSafeInteger(state.syncVersion) || state.syncVersion < 1))
        throw new InventoryWriteError(
          409,
          'INVENTORY_CONFLICT',
          'Inventory revision requires recovery',
        );
      // Read the revision BEFORE every page. Any intervening participating write invalidates this plan.
      const items = await this.query(userId, 'ITEM#');
      const groups = await this.query(userId, 'GROUP#');
      const { writes, result } = await plan({ state, items, groups });
      if (!writes.length) return result;
      const now = new Date().toISOString();
      const nextVersion = Number(state?.syncVersion ?? 0) + 1;
      if (!Number.isSafeInteger(nextVersion))
        throw new InventoryWriteError(
          409,
          'INVENTORY_CONFLICT',
          'Inventory revision requires recovery',
        );
      const revision: Write = {
        Put: {
          TableName: this.table,
          Item: {
            ...key,
            entityType: 'InventoryState',
            createdAt: state?.createdAt ?? now,
            updatedAt: now,
            syncVersion: nextVersion,
          },
          ConditionExpression: state ? 'syncVersion = :expected' : 'attribute_not_exists(PK)',
          ...(state ? { ExpressionAttributeValues: { ':expected': state.syncVersion } } : {}),
        },
      };
      try {
        await this.client.send(
          new TransactWriteCommand({
            ClientRequestToken: randomUUID(),
            TransactItems: [revision, ...writes],
          }),
        );
        return result;
      } catch (error) {
        const failure = error as { name?: string; CancellationReasons?: { Code?: string }[] };
        const reasons = failure.CancellationReasons;
        const conflict =
          failure.name === 'TransactionCanceledException' &&
          reasons?.some(
            (r) => r.Code === 'ConditionalCheckFailed' || r.Code === 'TransactionConflict',
          ) &&
          reasons.every(
            (r) =>
              !r.Code || ['None', 'ConditionalCheckFailed', 'TransactionConflict'].includes(r.Code),
          );
        // Only a definitely cancelled transaction may be replanned. Never replay an ambiguous timeout/500.
        if (!conflict) throw error;
        if (attempt === 7)
          throw new InventoryWriteError(
            409,
            'INVENTORY_CONFLICT',
            'Inventory changed concurrently. Refresh and try again.',
          );
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * Math.min(800, 20 * 2 ** attempt)),
        );
      }
    }
    throw new Error('Unreachable inventory retry state');
  }

  private groupChanges(
    userId: string,
    snapshot: Snapshot,
    after: InventoryRow[],
    identities: Map<string, InventoryRow>,
    thresholdEdit?: { groupId: string; threshold: number | null; thresholdUnit?: string },
  ): { writes: Write[]; change: Change } {
    const writes: Write[] = [];
    const change: Change = { groups: [], lowStockTransition: false };
    for (const [groupId, identity] of identities) {
      const current = snapshot.groups.find((g) => g.groupId === groupId);
      const now = new Date().toISOString();
      const group: InventoryRow = current
        ? { ...current }
        : {
            PK: `USER#${userId}`,
            SK: `GROUP#${groupId}`,
            entityType: 'InventoryGroup',
            groupId,
            canonicalKey: canonicalGroupKey(
              String(identity.name),
              String(identity.category),
              String(identity.unit),
            ),
            name: identity.name,
            category: identity.category,
            unit: canonicalUnit(String(identity.unit)),
            createdAt: now,
          };
      if (!current && typeof identity.threshold === 'number') {
        group.threshold = identity.threshold;
        group.thresholdUnit = identity.thresholdUnit ?? identity.unit;
      } else if (!current && identity.isLowStock === true && identity.quantity === 0) {
        group.threshold = 0;
      }
      // Missing links are not guessed. Only the edited legacy lot is explicitly adopted below.
      const lots = after.filter((i) => i.groupId === groupId);
      let total = 0;
      for (const lot of lots) {
        if (typeof lot.quantity !== 'number' || !Number.isFinite(lot.quantity) || lot.quantity < 0)
          throw new InventoryWriteError(
            409,
            'INVENTORY_CONFLICT',
            'Inventory quantity requires recovery',
          );
        const quantity = convertThreshold(lot.quantity, String(lot.unit), String(group.unit));
        if (quantity === null)
          throw new InventoryWriteError(
            400,
            'VALIDATION_ERROR',
            'Stock unit must be compatible with the group unit. Reassign the item to another group.',
          );
        total += quantity;
      }
      if (!Number.isFinite(total))
        throw new InventoryWriteError(400, 'VALIDATION_ERROR', 'Inventory total must be finite');
      if (thresholdEdit?.groupId === groupId) {
        if (thresholdEdit.threshold === null) {
          delete group.threshold;
          delete group.thresholdUnit;
        } else {
          const unit = thresholdEdit.thresholdUnit ?? String(group.unit);
          if (convertThreshold(1, unit, String(group.unit)) === null)
            throw new InventoryWriteError(
              400,
              'VALIDATION_ERROR',
              'Threshold unit must be compatible with the stock unit',
            );
          group.threshold = thresholdEdit.threshold;
          group.thresholdUnit = unit;
        }
      }
      if (
        group.threshold !== undefined &&
        (typeof group.threshold !== 'number' ||
          !Number.isFinite(group.threshold) ||
          group.threshold < 0 ||
          convertThreshold(1, String(group.thresholdUnit ?? group.unit), String(group.unit)) ===
            null)
      )
        throw new InventoryWriteError(
          409,
          'INVENTORY_CONFLICT',
          'Inventory threshold requires recovery',
        );
      group.totalQuantity = total;
      group.isLowStock = calculateLowStock(
        total,
        group.threshold as number | undefined,
        group.thresholdUnit as string | undefined,
        String(group.unit),
      );
      group.updatedAt = now;
      group.syncVersion = Number(current?.syncVersion ?? 0) + 1;
      if (!lots.length && group.threshold === undefined) {
        if (current) writes.push(this.remove(current));
        continue;
      }
      writes.push(this.put(group));
      change.groups.push(group);
      if (current?.isLowStock !== true && group.isLowStock) {
        change.lowStockTransition = true;
        change.notificationGroup = group;
      }
    }
    return { writes, change };
  }

  async add(userId: string, item: InventoryRow): Promise<Change> {
    return this.transact(userId, async (snapshot) => {
      if (snapshot.items.some((i) => i.itemId === item.itemId))
        throw new InventoryWriteError(409, 'INVENTORY_CONFLICT', 'Inventory item already exists');
      const groupId = groupFor(item);
      const target = snapshot.groups.find((g) => g.groupId === groupId);
      if (
        target &&
        target.canonicalKey !==
          canonicalGroupKey(String(item.name), String(item.category), String(item.unit))
      )
        throw new InventoryWriteError(
          409,
          'INVENTORY_CONFLICT',
          'Inventory group identity requires recovery',
        );
      const next = { ...item, PK: `USER#${userId}`, SK: `ITEM#${item.itemId}`, userId, groupId };
      const { writes, change } = this.groupChanges(
        userId,
        snapshot,
        [...snapshot.items, next],
        new Map([[groupId, next]]),
      );
      return { writes: [this.put(next), ...writes], result: { ...change, item: next } };
    });
  }

  async update(
    userId: string,
    itemId: string,
    fields: InventoryRow,
    reassign: boolean,
  ): Promise<Change> {
    return this.transact(userId, async (snapshot) => {
      const current = snapshot.items.find((i) => i.itemId === itemId);
      if (!current) throw new InventoryWriteError(404, 'NOT_FOUND', 'Inventory item not found');
      const next: InventoryRow = {
        ...current,
        ...fields,
        updatedAt: new Date().toISOString(),
        syncVersion: Number(current.syncVersion ?? 0) + 1,
      };
      const oldId = groupFor(current);
      const newId = reassign
        ? defaultGroupId(String(next.name), String(next.category), String(next.unit))
        : oldId;
      next.groupId = newId;
      delete next.threshold;
      delete next.isLowStock;
      next.GSI1PK = `USER#${userId}#CAT#${next.category}`;
      next.GSI1SK = `ITEM#${itemId}`;
      const identities = new Map([[oldId, current]]);
      if (newId !== oldId) identities.set(newId, next);
      if (newId !== oldId) {
        const target = snapshot.groups.find((g) => g.groupId === newId);
        if (
          target &&
          target.canonicalKey !==
            canonicalGroupKey(String(next.name), String(next.category), String(next.unit))
        )
          throw new InventoryWriteError(
            409,
            'INVENTORY_CONFLICT',
            'Inventory group identity requires recovery',
          );
      }
      const after = snapshot.items.map((i) => (i.itemId === itemId ? next : i));
      const { writes, change } = this.groupChanges(userId, snapshot, after, identities);
      return { writes: [this.put(next), ...writes], result: { ...change, item: next } };
    });
  }

  async delete(userId: string, itemId: string): Promise<void> {
    return this.transact(userId, async (snapshot) => {
      const current = snapshot.items.find((i) => i.itemId === itemId);
      if (!current) throw new InventoryWriteError(404, 'NOT_FOUND', 'Inventory item not found');
      const { writes } = this.groupChanges(
        userId,
        snapshot,
        snapshot.items.filter((i) => i.itemId !== itemId),
        new Map([[groupFor(current), current]]),
      );
      return { writes: [this.remove(current), ...writes], result: undefined };
    });
  }

  async threshold(
    userId: string,
    groupId: string,
    threshold: number | null,
    thresholdUnit?: string,
  ): Promise<Change> {
    return this.transact(userId, async (snapshot) => {
      const current = snapshot.groups.find((g) => g.groupId === groupId);
      if (!current) throw new InventoryWriteError(404, 'NOT_FOUND', 'Inventory group not found');
      const { writes, change } = this.groupChanges(
        userId,
        snapshot,
        snapshot.items,
        new Map([[groupId, current]]),
        { groupId, threshold, thresholdUnit },
      );
      return { writes, result: change };
    });
  }

  async ensurePlaceholder(userId: string, name: string, unit: string): Promise<void> {
    const itemId = randomUUID();
    return this.transact(userId, async (snapshot) => {
      if (snapshot.items.some((i) => String(i.name).toLowerCase() === name.toLowerCase()))
        return { writes: [], result: undefined };
      const locations = await this.query(userId, 'LOCATION#');
      const existingLocation =
        locations.find((l) => String(l.name).trim().toLowerCase() === 'limbo pantry') ??
        locations.find((l) => l.locationId === 'unknown');
      const now = new Date().toISOString();
      const location = existingLocation ?? {
        PK: `USER#${userId}`,
        SK: 'LOCATION#unknown',
        entityType: 'StorageLocation',
        locationId: 'unknown',
        userId,
        name: 'Limbo Pantry',
        createdAt: now,
        updatedAt: now,
        syncVersion: 1,
      };
      const groupId = defaultGroupId(name, 'Uncategorized', resolveUnit(unit));
      const item = {
        PK: `USER#${userId}`,
        SK: `ITEM#${itemId}`,
        entityType: 'InventoryItem',
        itemId,
        userId,
        groupId,
        name,
        category: 'Uncategorized',
        unit: resolveUnit(unit),
        quantity: 0,
        expirationDate: '2099-12-31',
        location: location.locationId,
        GSI1PK: `USER#${userId}#CAT#Uncategorized`,
        GSI1SK: `ITEM#${itemId}`,
        createdAt: now,
        updatedAt: now,
        syncVersion: 1,
      };
      const configured = snapshot.groups.some((g) => g.groupId === groupId);
      const { writes, change: _change } = this.groupChanges(
        userId,
        snapshot,
        [...snapshot.items, item],
        new Map([[groupId, item]]),
        configured ? undefined : { groupId, threshold: 0 },
      );
      const locationWrite: Write = existingLocation
        ? {
            ConditionCheck: {
              TableName: this.table,
              Key: { PK: location.PK, SK: location.SK },
              ConditionExpression: 'attribute_exists(PK)',
            },
          }
        : {
            Put: {
              TableName: this.table,
              Item: location,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          };
      return { writes: [this.put(item), ...writes, locationWrite], result: undefined };
    });
  }
}
