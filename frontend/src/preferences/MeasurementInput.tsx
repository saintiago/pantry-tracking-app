import React, { useState } from 'react';
import { convertStockQuantity } from '@pantry/domain';
import { parseFractionalQuantity } from '../utils/quantity';
import { displayQuantity, displayUnit } from './measurements';
import { usePreferences } from './store';
export function numericText(value: string): number | null {
  return value.trim() === '0' ? 0 : parseFractionalQuantity(value);
}
export function changeMeasureUnit(value: string, from: string, to: string): string {
  const quantity = numericText(value);
  if (quantity === null) return value;
  // Selecting a unit describes the typed number; Settings performs physical conversion.
  const shown = displayQuantity(quantity, from);
  return String(convertStockQuantity(shown, displayUnit(to), to) ?? shown);
}
/** Keep typed fractions/invalid text intact and never round a saved value on render. */
export default function MeasurementInput({
  unit,
  value,
  onValue,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  unit: string;
  value: string | number;
  onValue: (value: string) => void;
}) {
  const { measurement } = usePreferences();
  const [typed, setTyped] = useState<{ value: string; stored: string; key: string }>();
  const key = `${unit}:${measurement}`;
  const stored = String(value);
  const quantity = numericText(stored);
  const shown =
    typed?.stored === stored && typed.key === key
      ? typed.value
      : quantity === null || displayUnit(unit) === unit
        ? stored
        : String(Number(displayQuantity(quantity, unit).toPrecision(10)));
  return (
    <input
      {...props}
      value={shown}
      onChange={(event) => {
        const entered = event.target.value;
        const number = numericText(entered);
        const result =
          number === null
            ? entered
            : String(convertStockQuantity(number, displayUnit(unit), unit) ?? number);
        setTyped({ value: entered, stored: result, key });
        onValue(result);
      }}
    />
  );
}
