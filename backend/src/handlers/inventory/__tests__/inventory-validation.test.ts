import { validateAddRequest, validateInventoryFields } from '../inventory-validation';

const valid = {
  name: 'Milk',
  category: 'Dairy',
  expirationDate: '2026-09-10',
  locationId: 'fridge',
  quantity: 1,
  unit: 'l',
};
test.each(['1', null, [], {}, -1, Infinity])('rejects invalid quantity %s', (quantity) => {
  expect(
    validateAddRequest({ ...valid, quantity }).some((error) => error.field === 'quantity'),
  ).toBe(true);
});
test.each(['name', 'category', 'expirationDate', 'locationId', 'pictureUrl', 'barcode'])(
  'rejects non-text %s',
  (field) => {
    expect(validateInventoryFields({ [field]: {} })).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
  },
);
test('preserves supported legacy units and zero stock', () => {
  expect(validateAddRequest({ ...valid, quantity: 0, unit: 'Liter' })).toEqual([]);
});

test('requires an explicit date or N/A and validates date updates too', () => {
  expect(validateAddRequest({ ...valid, expirationDate: null, icon: '🧼' })).toEqual([]);
  for (const expirationDate of ['', '2026-02-30', '2026-13-01', 42, false]) {
    expect(validateAddRequest({ ...valid, expirationDate })).not.toEqual([]);
    expect(validateInventoryFields({ expirationDate })).not.toEqual([]);
  }
  expect(validateAddRequest({ ...valid, expirationDate: undefined })).not.toEqual([]);
  expect(validateInventoryFields({ expirationDate: null })).toEqual([]);
  expect(validateInventoryFields({ icon: {} })).not.toEqual([]);
  expect(validateInventoryFields({ icon: 'a'.repeat(33) })).not.toEqual([]);
});
