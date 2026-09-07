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
