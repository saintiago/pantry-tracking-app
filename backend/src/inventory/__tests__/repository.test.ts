import { InventoryRepository } from '../repository';
import { defaultGroupId } from '../groups';
import { InventoryMemory, lot } from './memory';

let memory: InventoryMemory;
let repository: InventoryRepository;
beforeEach(() => {
  memory = new InventoryMemory();
  repository = new InventoryRepository(memory.client, 'test');
});
const groupId = defaultGroupId('Rice', 'Food', 'g');

it('atomically creates a lot, group and permanent revision without dropping optional data', async () => {
  const result = await repository.add('u', {
    ...lot('a', 5),
    pictureUrl: 'https://example.com/rice',
    locationDetails: 'Shelf 2',
  });
  expect(result.item).toMatchObject({
    groupId,
    pictureUrl: 'https://example.com/rice',
    locationDetails: 'Shelf 2',
  });
  expect(memory.get('u', `GROUP#${groupId}`)).toMatchObject({
    totalQuantity: 5,
    isLowStock: false,
  });
  expect(memory.transactions).toHaveLength(1);
  expect(memory.transactions[0].input.TransactItems).toHaveLength(3);
  expect(memory.transactions[0].input.ClientRequestToken).toMatch(/^[a-f0-9-]{36}$/);
});

it('preserves simultaneous adds to the same group, including first group creation', async () => {
  await Promise.all(
    Array.from({ length: 8 }, (_, i) => repository.add('u', lot(String(i), i + 1))),
  );
  expect(memory.all('ITEM#')).toHaveLength(8);
  expect(memory.all('GROUP#')).toHaveLength(1);
  expect(memory.get('u', `GROUP#${groupId}`)?.totalQuantity).toBe(36);
  expect(memory.get('u', 'INVENTORY_STATE')?.syncVersion).toBe(8);
});

it('preserves other fields across overlapping updates, threshold changes and deletion', async () => {
  await repository.add('u', lot('a', 5));
  await repository.add('u', lot('b', 5));
  await Promise.all([
    repository.update('u', 'a', { quantity: 3 }, false),
    repository.update('u', 'a', { locationDetails: 'Top' }, false),
    repository.delete('u', 'b'),
    repository.threshold('u', groupId, 4),
  ]);
  expect(memory.get('u', 'ITEM#a')).toMatchObject({ quantity: 3, locationDetails: 'Top' });
  expect(memory.get('u', 'ITEM#b')).toBeUndefined();
  expect(memory.get('u', `GROUP#${groupId}`)).toMatchObject({
    totalQuantity: 3,
    threshold: 4,
    isLowStock: true,
  });
});

it('reassigns a lot and updates both groups without losing a source low-stock transition', async () => {
  await repository.add('u', lot('a', 5));
  await repository.add('u', lot('b', 5));
  await repository.threshold('u', groupId, 6);
  const change = await repository.update('u', 'a', { name: 'Beans', quantity: 2 }, true);
  expect(change.lowStockTransition).toBe(true);
  expect(change.notificationGroup?.groupId).toBe(groupId);
  expect(memory.get('u', `GROUP#${groupId}`)).toMatchObject({ totalQuantity: 5, isLowStock: true });
  expect(memory.get('u', `GROUP#${defaultGroupId('Beans', 'Food', 'g')}`)?.totalQuantity).toBe(2);
});

it('converts retained-group units and threshold units, and rejects mixed dimensions with no writes', async () => {
  await repository.add('u', lot('a', 500));
  await repository.update('u', 'a', { unit: 'kg', quantity: 0.5 }, false);
  await repository.threshold('u', groupId, 0.5, 'kg');
  expect(memory.get('u', `GROUP#${groupId}`)).toMatchObject({
    totalQuantity: 500,
    isLowStock: true,
  });
  const before = structuredClone([...memory.rows]);
  await expect(repository.update('u', 'a', { unit: 'ml' }, false)).rejects.toMatchObject({
    statusCode: 400,
  });
  expect([...memory.rows]).toEqual(before);
});

it('keeps groups for zero-quantity lots, deletes only empty unconfigured groups and retains the revision', async () => {
  await repository.add('u', lot('a', 0));
  expect(memory.all('GROUP#')).toHaveLength(1);
  await repository.delete('u', 'a');
  expect(memory.all('GROUP#')).toHaveLength(0);
  expect(memory.get('u', 'INVENTORY_STATE')?.syncVersion).toBe(2);
  await repository.add('u', lot('b', 2));
  await repository.threshold('u', groupId, 1);
  await repository.delete('u', 'b');
  expect(memory.get('u', `GROUP#${groupId}`)).toMatchObject({ totalQuantity: 0, isLowStock: true });
  await repository.threshold('u', groupId, null);
  expect(memory.all('GROUP#')).toHaveLength(0);
});

it('reconciles existing totals from every page and includes expired stock', async () => {
  await repository.add('u', lot('a', 2));
  await repository.add('u', lot('b', 3));
  memory.seed(
    { ...memory.get('u', `GROUP#${groupId}`)!, totalQuantity: 999 },
    { ...memory.get('u', 'ITEM#a')!, expirationDate: '2000-01-01' },
  );
  memory.pageSize = 1;
  await repository.update('u', 'b', { quantity: 4 }, false);
  expect(memory.get('u', `GROUP#${groupId}`)?.totalQuantity).toBe(6);
});

it('does not commit any partial state when a transaction fails', async () => {
  memory.failure = Object.assign(new Error('Denied'), { name: 'AccessDeniedException' });
  await expect(repository.add('u', lot('a'))).rejects.toThrow('Denied');
  expect(memory.rows.size).toBe(0);
  expect(memory.transactions).toHaveLength(1);
});

it('does not replay an ambiguous response after a successful commit', async () => {
  memory.afterCommitFailure = Object.assign(new Error('Connection lost'), { name: 'TimeoutError' });
  await expect(repository.add('u', lot('a', 2))).rejects.toThrow('Connection lost');
  expect(memory.transactions).toHaveLength(1);
  expect(memory.get('u', `GROUP#${groupId}`)?.totalQuantity).toBe(2);
});

it('only retries confirmed concurrency failures and reports bounded contention', async () => {
  const error = Object.assign(new Error('Cancelled'), {
    name: 'TransactionCanceledException',
    CancellationReasons: [{ Code: 'ValidationError' }],
  });
  memory.failure = error;
  await expect(repository.add('u', lot('a'))).rejects.toBe(error);
  expect(memory.transactions).toHaveLength(1);
});

it('isolates account partitions and rejects missing/deleted items without resurrection', async () => {
  await repository.add('u', lot('a', 2));
  await expect(repository.update('other', 'a', { quantity: 4 }, false)).rejects.toMatchObject({
    statusCode: 404,
  });
  await repository.delete('u', 'a');
  await expect(repository.update('u', 'a', { quantity: 4 }, false)).rejects.toMatchObject({
    statusCode: 404,
  });
  expect(memory.get('u', 'ITEM#a')).toBeUndefined();
});

it('creates valid placeholders, a real location and group threshold once under concurrency', async () => {
  await Promise.all(
    Array.from({ length: 5 }, () => repository.ensurePlaceholder('u', 'Milk', 'Liter')),
  );
  expect(memory.all('ITEM#')).toHaveLength(1);
  expect(memory.all('GROUP#')[0]).toMatchObject({ threshold: 0, isLowStock: true, unit: 'l' });
  expect(memory.all('ITEM#')[0]).toMatchObject({
    category: 'Uncategorized',
    quantity: 0,
    unit: 'l',
    location: 'unknown',
    GSI1PK: 'USER#u#CAT#Uncategorized',
  });
  expect(memory.all('ITEM#')[0].isLowStock).toBeUndefined();
  expect(memory.all('LOCATION#')[0]).toMatchObject({ name: 'Limbo Pantry' });
});

it('adopts the edited legacy lot without guessing membership for unrelated unlinked lots', async () => {
  memory.seed({ ...lot('legacy', 3), isLowStock: true }, lot('unlinked', 7));
  await repository.update('u', 'legacy', { location: 'pantry' }, false);
  expect(memory.get('u', 'ITEM#legacy')?.isLowStock).toBeUndefined();
  expect(memory.get('u', `GROUP#${groupId}`)?.totalQuantity).toBe(3);
  expect(memory.get('u', 'ITEM#unlinked')?.groupId).toBeUndefined();
});

it('preserves an adopted legacy threshold and the original identity when keeping its group', async () => {
  memory.seed({ ...lot('legacy', 3), threshold: 5 });
  await repository.update('u', 'legacy', { name: 'Brown rice' }, false);
  expect(memory.get('u', `GROUP#${groupId}`)).toMatchObject({
    name: 'Rice',
    canonicalKey: 'rice|food|g',
    threshold: 5,
    totalQuantity: 3,
    isLowStock: true,
  });
  expect(memory.get('u', 'ITEM#legacy')?.threshold).toBeUndefined();
});
