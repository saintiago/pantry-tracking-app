import { computeAvailability } from '../recipe-rules';
test('availability converts compatible imperial stock without treating volume as weight', () => {
  const result = computeAvailability(
    [{ name: 'Flour', quantity: 500, unit: 'g' }],
    [
      { name: 'Flour', quantity: 1, unit: 'lb' },
      { name: 'Flour', quantity: 500, unit: 'ml' },
    ],
  );
  expect(result.ingredientAvailability[0].available).toBeCloseTo(453.59237, 9);
  expect(result.ingredientAvailability[0].status).toBe('partial');
});
