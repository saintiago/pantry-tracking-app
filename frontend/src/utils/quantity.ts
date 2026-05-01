/**
 * Common cooking fractions with their decimal values and display strings.
 * Ordered so that the closest match is found first when multiple fractions
 * are within tolerance.
 */
const FRACTIONS: Array<{ decimal: number; display: string }> = [
  { decimal: 1 / 2, display: '1/2' },
  { decimal: 1 / 3, display: '1/3' },
  { decimal: 2 / 3, display: '2/3' },
  { decimal: 1 / 4, display: '1/4' },
  { decimal: 3 / 4, display: '3/4' },
];

const FRACTION_TOLERANCE = 0.01;

/**
 * Formats a numeric quantity as a human-readable cooking string.
 *
 * Rules:
 * - 0 → "0"
 * - Negative values are treated as their absolute value (defensive).
 * - Whole numbers → "2", "3", etc.
 * - Decimal part matches a common fraction within 0.01 tolerance:
 *     - Whole part is 0 → "1/2", "1/4", etc. (no leading zero)
 *     - Whole part > 0 → "1 1/2", "2 1/4", etc.
 * - Decimal part does not match → rounded to at most 2 decimal places.
 */
export function formatQuantity(n: number): string {
  const abs = Math.abs(n);
  if (abs === 0) return '0';

  const whole = Math.floor(abs);
  const decimal = abs - whole;

  if (decimal < FRACTION_TOLERANCE) {
    // Whole number (or close enough)
    return String(whole === 0 ? 0 : whole);
  }

  for (const { decimal: fracDecimal, display } of FRACTIONS) {
    if (Math.abs(decimal - fracDecimal) < FRACTION_TOLERANCE) {
      return whole === 0 ? display : `${whole} ${display}`;
    }
  }

  // No matching fraction — round to 2 decimal places
  return String(Math.round(abs * 100) / 100);
}

/**
 * Parses a fractional quantity string to a decimal number.
 *
 * Accepts:
 * - Whole numbers: "2", "3"
 * - Simple fractions: "1/2", "3/4"
 * - Mixed numbers: "1 1/2", "2 1/4"
 * - Decimal numbers: "1.5", "0.25"
 *
 * Returns null if the string cannot be parsed as a positive number.
 */
export function parseFractionalQuantity(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;

  // Try decimal / whole number first
  const asNumber = Number(trimmed);
  if (!isNaN(asNumber) && asNumber > 0) return asNumber;

  // Try simple fraction: "1/2"
  const simpleFraction = /^(\d+)\/(\d+)$/.exec(trimmed);
  if (simpleFraction) {
    const num = parseInt(simpleFraction[1], 10);
    const den = parseInt(simpleFraction[2], 10);
    if (den === 0) return null;
    const result = num / den;
    return result > 0 ? result : null;
  }

  // Try mixed number: "1 1/2"
  const mixedNumber = /^(\d+)\s+(\d+)\/(\d+)$/.exec(trimmed);
  if (mixedNumber) {
    const whole = parseInt(mixedNumber[1], 10);
    const num = parseInt(mixedNumber[2], 10);
    const den = parseInt(mixedNumber[3], 10);
    if (den === 0) return null;
    const result = whole + num / den;
    return result > 0 ? result : null;
  }

  return null;
}
