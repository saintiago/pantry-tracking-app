import * as fc from 'fast-check';
import { InventoryRepository } from '../repository';
import { defaultGroupId } from '../groups';
import { InventoryMemory, lot } from './memory';

it('preserves persisted quantities, group membership, thresholds and transitions across generated mutation sequences', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          id: fc.integer({ min: 0, max: 5 }),
          quantity: fc.integer({ min: 0, max: 1000 }),
          remove: fc.boolean(),
          threshold: fc.option(fc.integer({ min: 0, max: 2000 }), { nil: null }),
        }),
        { minLength: 1, maxLength: 30 },
      ),
      async (operations) => {
        const memory = new InventoryMemory();
        const repository = new InventoryRepository(memory.client, 'test');
        const expected = new Map<string, number>();
        const id = defaultGroupId('Rice', 'Food', 'g');
        for (const operation of operations) {
          const key = String(operation.id);
          if (operation.remove && expected.has(key)) {
            await repository.delete('u', key);
            expected.delete(key);
          } else if (expected.has(key)) {
            await repository.update('u', key, { quantity: operation.quantity }, false);
            expected.set(key, operation.quantity);
          } else {
            await repository.add('u', lot(key, operation.quantity));
            expected.set(key, operation.quantity);
          }
          if (memory.get('u', `GROUP#${id}`))
            await repository.threshold('u', id, operation.threshold);
          const total = [...expected.values()].reduce((sum, n) => sum + n, 0);
          const group = memory.get('u', `GROUP#${id}`);
          expect(memory.all('ITEM#')).toHaveLength(expected.size);
          for (const [itemId, quantity] of expected)
            expect(memory.get('u', `ITEM#${itemId}`)).toMatchObject({ quantity, groupId: id });
          if (group)
            expect(group).toMatchObject({
              totalQuantity: total,
              isLowStock: operation.threshold !== null && total <= operation.threshold,
            });
          else expect(expected.size).toBe(0);
        }
      },
    ),
    { numRuns: 80 },
  );
});

it('preserves arbitrary valid names, legacy units and optional image references on addition', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
      fc.constantFrom('Gram', 'Kilo', 'Liter', 'Unit'),
      fc.option(fc.webUrl(), { nil: undefined }),
      async (name, unit, pictureUrl) => {
        const memory = new InventoryMemory();
        const repository = new InventoryRepository(memory.client, 'test');
        const fields = { ...lot('a', 2, unit, name), ...(pictureUrl ? { pictureUrl } : {}) };
        await repository.add('u', fields);
        expect(memory.get('u', 'ITEM#a')).toMatchObject(fields);
        expect(memory.all('GROUP#')[0].totalQuantity).toBe(2);
        if (!pictureUrl) expect(memory.get('u', 'ITEM#a')?.pictureUrl).toBeUndefined();
      },
    ),
  );
});
