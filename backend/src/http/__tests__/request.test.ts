import { inventoryCursor, parseObject } from '../request';

describe('request envelopes', () => {
  test.each(['null', '[]', '1', 'true', '"text"', '{'])('rejects %s', (body) => {
    expect(() => parseObject(body)).toThrow();
  });
  test('accepts objects without changing their fields', () => {
    expect(parseObject('{"quantity":0}')).toEqual({ quantity: 0 });
  });
});

describe('inventory cursors', () => {
  test('accepts only the authenticated inventory partition', () => {
    const key = { PK: 'USER#alice', SK: 'ITEM#123' };
    expect(inventoryCursor(encodeURIComponent(JSON.stringify(key)), 'alice')).toEqual(key);
    expect(inventoryCursor(undefined, 'alice')).toBeUndefined();
  });
  test.each([
    '%broken',
    'null',
    '[]',
    '{}',
    JSON.stringify({ PK: 'USER#bob', SK: 'ITEM#123' }),
    JSON.stringify({ PK: 'USER#alice', SK: 'RECIPE#123' }),
    JSON.stringify({ PK: 'USER#alice', SK: 'ITEM#123', extra: true }),
  ])('rejects malformed or foreign cursor %s', (cursor) => {
    expect(() => inventoryCursor(cursor, 'alice')).toThrow();
  });
});
