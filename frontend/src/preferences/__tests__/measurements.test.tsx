import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { convertStockQuantity } from '@pantry/domain';
import {
  defaults,
  loadPreferences,
  savePreferences,
  parsePreferences,
  getPreferences,
} from '../store';
import { displayQuantity } from '../measurements';
import MeasurementInput, { changeMeasureUnit } from '../MeasurementInput';
import { formatMeasurement, localizedUnits } from '../../types/units';
import { buildInventoryIndex, computeAllAvailable } from '../../domain/recipes/availability';
beforeEach(() => {
  localStorage.clear();
  loadPreferences('test');
  savePreferences(defaults);
});
test('known conversions are reversible and never convert mass into volume or counts', () => {
  expect(convertStockQuantity(1, 'lb', 'g')).toBeCloseTo(453.59237, 8);
  expect(convertStockQuantity(16, 'oz', 'lb')).toBeCloseTo(1, 12);
  expect(convertStockQuantity(1, 'gallon', 'l')).toBeCloseTo(3.785411784, 9);
  expect(convertStockQuantity(1, 'cup', 'tbsp')).toBeCloseTo(16, 12);
  expect(convertStockQuantity(100, 'g', 'ml')).toBeNull();
  expect(convertStockQuantity(1, 'piece', 'oz')).toBeNull();
  const original = 0.00014567;
  expect(convertStockQuantity(convertStockQuantity(original, 'kg', 'oz')!, 'oz', 'kg')).toBeCloseTo(
    original,
    14,
  );
});
test('system choices update display without modifying source and keep tiny quantities visible', () => {
  const source = { quantity: 453.59237, unit: 'g' };
  savePreferences({ ...defaults, measurement: 'imperial' });
  expect(displayQuantity(source.quantity, source.unit)).toBeCloseTo(16, 10);
  expect(formatMeasurement(source.quantity, source.unit)).toBe('16 ounces');
  expect(formatMeasurement(0.00001, 'g')).not.toMatch(/^0 /);
  savePreferences({ ...defaults, measurement: 'metric' });
  expect(formatMeasurement(1, 'lb')).toBe('0.45359 kilograms');
  savePreferences(defaults);
  expect(displayQuantity(source.quantity, source.unit)).toBe(source.quantity);
});
test('editing converted values saves the equivalent source amount and leaves untouched precision alone', () => {
  savePreferences({ ...defaults, measurement: 'imperial' });
  let actual = '453.59237';
  function Editor() {
    const [value, setValue] = useState(actual);
    return (
      <MeasurementInput
        aria-label="Quantity"
        unit="g"
        value={value}
        onValue={(next) => {
          actual = next;
          setValue(next);
        }}
      />
    );
  }
  render(<Editor />);
  expect(screen.getByLabelText('Quantity')).toHaveValue('16');
  expect(actual).toBe('453.59237');
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '8' } });
  expect(Number(actual)).toBeCloseTo(226.796185, 9);
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1/2' } });
  expect(screen.getByLabelText('Quantity')).toHaveValue('1/2');
  expect(Number(actual)).toBeCloseTo(14.1747615625, 9);
});
test('unit order and removals survive reload, while editing a removed unit remains possible', () => {
  savePreferences({ ...defaults, units: ['lb', 'piece'] });
  loadPreferences('test');
  expect(localizedUnits()).toEqual(['lb', 'piece']);
  expect(localizedUnits('g')).toEqual(['lb', 'piece', 'g']);
  loadPreferences('another-account');
  expect(getPreferences()).toEqual(defaults);
  expect(parsePreferences('{"units":["fake"],"appearance":"wrong"}')).toEqual(defaults);
});
test('availability compares compatible units and excludes incompatible stock', () => {
  const inventory = buildInventoryIndex([
    { name: 'Flour', quantity: 1, unit: 'lb' },
    { name: 'Flour', quantity: 500, unit: 'ml' },
  ]);
  expect(computeAllAvailable([{ name: 'Flour', quantity: 450, unit: 'g' }], inventory)).toBe(true);
  expect(computeAllAvailable([{ name: 'Flour', quantity: 500, unit: 'g' }], inventory)).toBe(false);
});

test('choosing a unit keeps the typed number, independently of system conversions', () => {
  expect(changeMeasureUnit('1', 'g', 'kg')).toBe('1');
  savePreferences({ ...defaults, measurement: 'imperial' });
  expect(Number(changeMeasureUnit('453.59237', 'g', 'lb'))).toBeCloseTo(16, 10);
});
