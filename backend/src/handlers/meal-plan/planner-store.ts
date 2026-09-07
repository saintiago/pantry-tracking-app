import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';
import type { PlannerSnapshot, PlannerChange, PlannerEntry } from '@pantry/domain';
import { validatePlanner } from './planner-rules';

export class PlannerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type Row = Record<string, unknown>;
export class PlannerStore {
  constructor(
    private client: DynamoDBDocumentClient,
    private table: string,
    private userId: string,
  ) {}
  private key(SK: string) {
    return { PK: `USER#${this.userId}`, SK };
  }
  async get(SK: string) {
    return (
      await this.client.send(
        new GetCommand({ TableName: this.table, Key: this.key(SK), ConsistentRead: true }),
      )
    ).Item;
  }
  async read(): Promise<PlannerSnapshot> {
    // Revision must precede the paginated reads. Every writer checks it at commit.
    const before = await this.get('PLANNER_STATE');
    const mealPlans: PlannerEntry[] = [];
    let cursor: Row | undefined;
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': this.key('').PK, ':prefix': 'MEAL#' },
          ConsistentRead: true,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      mealPlans.push(
        ...(result.Items ?? []).map((item) => {
          const { PK: _pk, SK: _sk, ...entry } = item;
          void _pk;
          void _sk;
          return entry as unknown as PlannerEntry;
        }),
      );
      cursor = result.LastEvaluatedKey;
    } while (cursor);
    const after = await this.get('PLANNER_STATE');
    if ((before?.revision ?? 0) !== (after?.revision ?? 0))
      throw new PlannerError(409, 'The planner changed while loading. Refresh and retry.');
    return {
      contractVersion: 2,
      revision: before?.revision ?? 0,
      mealPlans,
      batches: before?.batches ?? [],
      favorites: before?.favorites ?? [],
    };
  }
  async change(change: PlannerChange, legacy = false): Promise<PlannerSnapshot> {
    if (!change || typeof change !== 'object')
      throw new PlannerError(400, 'Invalid planner operation');
    if (
      typeof change.operationId !== 'string' ||
      !/^[\w-]{1,100}$/.test(change.operationId) ||
      !Number.isSafeInteger(change.revision) ||
      change.revision < 0
    )
      throw new PlannerError(400, 'A valid operation ID and planner revision are required');
    for (const field of [
      'entries',
      'removeIds',
      'batches',
      'removeBatchIds',
      'favorites',
      'removeFavoriteIds',
    ] as const) {
      if (
        change[field] !== undefined &&
        (!Array.isArray(change[field]) || change[field]!.length > 90)
      )
        throw new PlannerError(400, 'Invalid or oversized planner operation');
    }
    if (
      [...(change.entries ?? []), ...(change.batches ?? []), ...(change.favorites ?? [])].some(
        (item) => !item || typeof item !== 'object' || Array.isArray(item),
      )
    )
      throw new PlannerError(400, 'Invalid planner record');
    if (
      [
        ...(change.removeIds ?? []),
        ...(change.removeBatchIds ?? []),
        ...(change.removeFavoriteIds ?? []),
      ].some((id) => typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id))
    )
      throw new PlannerError(400, 'Invalid planner identifier');
    const fingerprint = createHash('sha256').update(JSON.stringify(change)).digest('hex');
    const receiptKey = `PLANNER_OP#${change.operationId}`;
    const receipt = await this.get(receiptKey);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new PlannerError(409, 'Operation ID was already used for different changes');
      if (receipt.cancelled)
        throw new PlannerError(409, 'This pending operation was cancelled after reconciliation');
      return this.read();
    }
    const current = await this.read();
    if (change.revision !== current.revision)
      throw new PlannerError(
        409,
        'The planner changed on another device. Refresh and review before retrying.',
      );
    const now = new Date().toISOString();
    const merge = <T>(
      items: T[],
      updates: T[] = [],
      remove: string[] = [],
      id: (item: T) => string,
    ): T[] => {
      if (new Set(updates.map(id)).size !== updates.length)
        throw new PlannerError(400, 'Duplicate updates');
      return [
        ...items.filter(
          (item) =>
            !remove.includes(id(item)) && !updates.some((update) => id(update) === id(item)),
        ),
        ...updates,
      ];
    };
    const entries = (change.entries ?? []).map((entry) => {
      const previous = current.mealPlans.find((e) => e.planId === entry.planId);
      return {
        ...entry,
        contractVersion: 2 as const,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        syncVersion: (previous?.syncVersion ?? 0) + 1,
      };
    });
    if (!legacy) {
      for (const entry of entries) {
        if (
          (!entry.entryType || entry.entryType === 'recipe') &&
          !current.mealPlans.some((e) => e.planId === entry.planId && e.recipeId === entry.recipeId)
        ) {
          if (!(await this.get(`RECIPE#${entry.recipeId}`)))
            throw new PlannerError(400, 'Recipe unavailable. Select an available recipe.');
        }
      }
    }
    const next: PlannerSnapshot = {
      contractVersion: 2,
      revision: current.revision + 1,
      mealPlans: merge(current.mealPlans, entries, change.removeIds, (e) => e.planId),
      batches: structuredClone(
        merge(current.batches, change.batches, change.removeBatchIds, (b) => b.batchId),
      ),
      favorites: merge(
        current.favorites,
        change.favorites,
        change.removeFavoriteIds,
        (f) => f.favoriteId,
      ),
    };
    // Only the authenticated recipe can supply a prepared nutrition snapshot.
    for (const batch of next.batches) {
      if (
        batch.status === 'prepared' &&
        current.batches.find((b) => b.batchId === batch.batchId)?.status !== 'prepared'
      ) {
        const recipe = await this.get(`RECIPE#${batch.recipeId}`);
        if (!recipe) throw new PlannerError(400, 'Recipe unavailable. Select an available recipe.');
        batch.kcalPerPortion =
          typeof recipe.totalKcal === 'number'
            ? recipe.totalKcal / (recipe.portions ?? 1)
            : undefined;
        batch.consumed = 0;
        batch.consumedAllocations = {};
      }
    }
    // Consumption is a ledger: removing an eaten entry never restores real food.
    for (const oldBatch of current.batches.filter((b) => b.status === 'prepared')) {
      const batch = next.batches.find((b) => b.batchId === oldBatch.batchId);
      if (
        !batch ||
        batch.status !== 'prepared' ||
        batch.recipeId !== oldBatch.recipeId ||
        batch.kcalPerPortion !== oldBatch.kcalPerPortion ||
        batch.consumed < oldBatch.consumed ||
        batch.discarded < oldBatch.discarded
      )
        throw new PlannerError(400, 'Prepared food history cannot be deleted or rewritten');
      batch.consumed = oldBatch.consumed;
      batch.consumedAllocations = { ...oldBatch.consumedAllocations };
    }
    for (const entry of entries) {
      const old = current.mealPlans.find((e) => e.planId === entry.planId);
      if (
        old?.consumed &&
        (!entry.consumed || entry.servings !== old.servings || entry.batchId !== old.batchId)
      )
        throw new PlannerError(400, 'Eaten portions cannot be reserved again');
      if (entry.consumed && !old?.consumed) {
        const batch = next.batches.find((b) => b.batchId === entry.batchId);
        if (batch) {
          const prior = batch.consumedAllocations?.[entry.planId];
          if (prior !== undefined && prior !== (entry.servings ?? 1))
            throw new PlannerError(400, 'Eaten portions cannot be reserved again');
          if (prior === undefined) {
            batch.consumed += entry.servings ?? 1;
            batch.consumedAllocations = {
              ...batch.consumedAllocations,
              [entry.planId]: entry.servings ?? 1,
            };
          }
        }
      }
      if (
        !entry.consumed &&
        next.batches.some((b) => b.consumedAllocations?.[entry.planId] !== undefined)
      )
        throw new PlannerError(400, 'Eaten portions cannot be reserved again');
    }
    let error: string | null;
    try {
      error = validatePlanner(next);
    } catch {
      throw new PlannerError(400, 'Invalid planner record');
    }
    if (error) throw new PlannerError(400, error);
    const stateRow = {
      ...this.key('PLANNER_STATE'),
      contractVersion: 2,
      revision: next.revision,
      batches: next.batches,
      favorites: next.favorites,
    };
    if (Buffer.byteLength(JSON.stringify(stateRow)) > 350000)
      throw new PlannerError(
        400,
        'Planner storage limit reached. Remove unused favorite weeks before saving.',
      );
    const keyFor = (entry: PlannerEntry) =>
      this.key(`MEAL#${entry.date}#${entry.mealType}#${entry.planId}`);
    const changes: NonNullable<
      ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']
    > = [];
    for (const old of current.mealPlans) {
      const updated = entries.find((e) => e.planId === old.planId);
      if (
        change.removeIds?.includes(old.planId) ||
        (updated && keyFor(old).SK !== keyFor(updated).SK)
      )
        changes.push({ Delete: { TableName: this.table, Key: keyFor(old) } });
    }
    for (const entry of entries)
      changes.push({
        Put: {
          TableName: this.table,
          Item: { ...entry, ...keyFor(entry), userId: this.userId, entityType: 'MealPlan' },
        },
      });
    if (changes.length > 98)
      throw new PlannerError(
        400,
        'Too many changes for one atomic operation. Select a smaller date range.',
      );
    changes.push({
      Put: {
        TableName: this.table,
        Item: stateRow,
        ConditionExpression: current.revision ? 'revision = :revision' : 'attribute_not_exists(PK)',
        ...(current.revision
          ? { ExpressionAttributeValues: { ':revision': current.revision } }
          : {}),
      },
    });
    changes.push({
      Put: {
        TableName: this.table,
        Item: { ...this.key(receiptKey), fingerprint, revision: next.revision },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    });
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: changes }));
    } catch (err) {
      // A timed-out transaction might have committed. A durable receipt resolves it.
      const saved = await this.get(receiptKey);
      if (saved?.fingerprint === fingerprint) return this.read();
      if ((err as Error).name === 'TransactionCanceledException')
        throw new PlannerError(409, 'The planner changed. Refresh and review before retrying.');
      throw err;
    }
    return next;
  }
  async reconcile(change: PlannerChange): Promise<PlannerSnapshot> {
    if (
      !change ||
      typeof change.operationId !== 'string' ||
      !/^[\w-]{1,100}$/.test(change.operationId)
    )
      throw new PlannerError(400, 'Invalid planner operation');
    const SK = `PLANNER_OP#${change.operationId}`;
    const fingerprint = createHash('sha256').update(JSON.stringify(change)).digest('hex');
    const receipt = await this.get(SK);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new PlannerError(409, 'Operation ID was already used for different changes');
      return this.read();
    }
    // A cancellation receipt and revision fence race safely against a delayed write.
    const state = await this.read();
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: { ...this.key(SK), fingerprint, cancelled: true },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: {
                  ...this.key('PLANNER_STATE'),
                  revision: state.revision + 1,
                  contractVersion: 2,
                  batches: state.batches,
                  favorites: state.favorites,
                },
                ConditionExpression: state.revision
                  ? 'revision = :revision'
                  : 'attribute_not_exists(PK)',
                ...(state.revision
                  ? { ExpressionAttributeValues: { ':revision': state.revision } }
                  : {}),
              },
            },
          ],
        }),
      );
    } catch (error) {
      const saved = await this.get(SK);
      if (saved?.fingerprint !== fingerprint) throw error;
    }
    return this.read();
  }
}
