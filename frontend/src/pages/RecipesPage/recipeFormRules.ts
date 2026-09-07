/**
 * Validates a time field string value.
 * Returns an error message if the value is non-empty and not a non-negative integer.
 */
export function validateTimeField(value: string, fieldName: string): string | undefined {
  if (value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    return `${fieldName} must be a non-negative whole number.`;
  }
  return undefined;
}

/**
 * Validates the portions field string value.
 * Returns an error message if empty or not a positive integer.
 */
export function validatePortionsField(value: string): string | undefined {
  if (value === '') return 'Portions is required.';
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return 'Portions must be a positive whole number (at least 1).';
  }
  return undefined;
}
