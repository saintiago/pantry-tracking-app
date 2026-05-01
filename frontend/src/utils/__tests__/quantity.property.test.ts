import * as fc from 'fast-check';
import { formatQuantity, parseFractionalQuantity } from '../quantity';

/**
 * Validates: Requirements 3.7, 7.2
 *
 * Property 5: Quantity formatter round-trip
 * For any valid fractional string accepted by parseFractionalQuantity,
 * parse → format → parse yields a value within 0.01 of the original.
 */
describe('Property 5: Quantity formatter round-trip', () => {
  // Generators for valid fractional strings
  const wholeNumberArb = fc
    .integer({ min: 1, max: 9999 })
    .map((n) => String(n));

  const simpleFractionArb = fc
    .tuple(
      fc.integer({ min: 1, max: 99 }),
      fc.integer({ min: 1, max: 99 }),
    )
    .filter(([num, den]) => num / den > 0)
    .map(([num, den]) => `${num}/${den}`);

  const mixedNumberArb = fc
    .tuple(
      fc.integer({ min: 1, max: 999 }),
      fc.integer({ min: 1, max: 99 }),
      fc.integer({ min: 1, max: 99 }),
    )
    .filter(([, num, den]) => den > 0)
    .map(([whole, num, den]) => `${whole} ${num}/${den}`);

  const validFractionalStringArb = fc.oneof(
    wholeNumberArb,
    simpleFractionArb,
    mixedNumberArb,
  );

  it('round-trips within 0.01 tolerance', () => {
    fc.assert(
      fc.property(validFractionalStringArb, (s) => {
        const parsed = parseFractionalQuantity(s);
        if (parsed === null) return true; // skip strings that don't parse (e.g. 0/den)

        const formatted = formatQuantity(parsed);
        const reparsed = parseFractionalQuantity(formatted);

        // The formatted string must be parseable
        if (reparsed === null) return false;

        return Math.abs(reparsed - parsed) < 0.01;
      }),
      { numRuns: 200 },
    );
  });
});

/**
 * Validates: Requirements 7.4
 *
 * Property 6: formatQuantity handles negative inputs defensively
 * For any positive number n, formatQuantity(-n) === formatQuantity(n).
 */
describe('Property 6: formatQuantity handles negative inputs defensively', () => {
  it('returns same string for n and -n', () => {
    fc.assert(
      fc.property(fc.float({ min: Math.fround(0.001), max: Math.fround(1000), noNaN: true }), (n) => {
        return formatQuantity(-n) === formatQuantity(n);
      }),
      { numRuns: 200 },
    );
  });
});

/**
 * Validates: Requirements 7.1
 *
 * Property 7: formatQuantity is pure (idempotent output)
 * For any non-negative number n, calling formatQuantity(n) twice returns the same string.
 */
describe('Property 7: formatQuantity is pure', () => {
  it('returns the same string on repeated calls', () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 10000, noNaN: true }), (n) => {
        return formatQuantity(n) === formatQuantity(n);
      }),
      { numRuns: 200 },
    );
  });
});

/**
 * Validates: Requirements 3.3
 *
 * Property 8: parseFractionalQuantity rejects invalid inputs
 * For any string that does not match valid patterns, parseFractionalQuantity returns null.
 *
 * We generate strings that are clearly not valid: strings containing letters,
 * or strings with multiple slashes, or strings that are empty after trimming.
 */
describe('Property 8: parseFractionalQuantity rejects invalid inputs', () => {
  // Strings containing at least one alphabetic character are never valid
  const stringWithLettersArb = fc
    .tuple(fc.string(), fc.char().filter((c) => /[a-zA-Z]/.test(c)), fc.string())
    .map(([a, letter, b]) => a + letter + b);

  it('returns null for strings containing letters', () => {
    fc.assert(
      fc.property(stringWithLettersArb, (s) => {
        return parseFractionalQuantity(s) === null;
      }),
      { numRuns: 200 },
    );
  });

  // Strings with multiple slashes are never valid
  const multipleSlashArb = fc
    .tuple(fc.string(), fc.string(), fc.string())
    .map(([a, b, c]) => `${a}/${b}/${c}`);

  it('returns null for strings with multiple slashes', () => {
    fc.assert(
      fc.property(multipleSlashArb, (s) => {
        return parseFractionalQuantity(s) === null;
      }),
      { numRuns: 200 },
    );
  });

  // Zero and negative numbers are not positive, so they return null
  it('returns null for zero', () => {
    expect(parseFractionalQuantity('0')).toBeNull();
  });

  it('returns null for negative decimal strings', () => {
    fc.assert(
      fc.property(fc.float({ min: Math.fround(0.001), max: Math.fround(10000), noNaN: true }), (n) => {
        return parseFractionalQuantity(`-${n}`) === null;
      }),
      { numRuns: 100 },
    );
  });
});
