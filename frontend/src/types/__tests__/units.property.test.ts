/**
 * Property-based tests for the unit system module.
 * Feature: recipe-units-format
 */
import * as fc from 'fast-check';
import {
  VALID_UNITS,
  UNIT_METADATA,
  resolveUnit,
  getUnitLabel,
} from '../units';

/**
 * Property 1: Unit metadata completeness
 * For any key in VALID_UNITS, UNIT_METADATA[key] has non-empty singular, abbreviation, and plural.
 * Validates: Requirements 1.1, 1.3, 1.4
 */
describe('Property 1: Unit metadata completeness', () => {
  it('every key in VALID_UNITS has non-empty singular, abbreviation, and plural', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VALID_UNITS), (key) => {
        const meta = UNIT_METADATA[key];
        expect(meta).toBeDefined();
        expect(meta.singular.length).toBeGreaterThan(0);
        expect(meta.abbreviation.length).toBeGreaterThan(0);
        expect(meta.plural.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 2: resolveUnit always returns a valid key
 * For any string input, resolveUnit returns a value that is a member of VALID_UNITS.
 * Validates: Requirements 2.2
 */
describe('Property 2: resolveUnit always returns a valid key', () => {
  it('returns a VALID_UNITS member for any string input', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = resolveUnit(s);
        expect(VALID_UNITS).toContain(result);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 3: resolveUnit is identity for valid keys
 * For any key sampled from VALID_UNITS, resolveUnit(key) === key.
 * Validates: Requirements 2.2
 */
describe('Property 3: resolveUnit is identity for valid keys', () => {
  it('returns the key unchanged for any key in VALID_UNITS', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VALID_UNITS), (key) => {
        expect(resolveUnit(key)).toBe(key);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 4: getUnitLabel singular/plural rule
 * For any key in VALID_UNITS and any numeric quantity,
 * getUnitLabel returns singular iff quantity === 1.
 * Validates: Requirements 1.3, 4.1, 4.3
 */
describe('Property 4: getUnitLabel singular/plural rule', () => {
  it('returns singular label when quantity is exactly 1', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VALID_UNITS), (key) => {
        const result = getUnitLabel(key, 1);
        expect(result).toBe(UNIT_METADATA[key].singular);
      }),
      { numRuns: 100 },
    );
  });

  it('returns plural label when quantity is not 1', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_UNITS),
        fc.float({ min: -1000, max: 1000 }).filter((n) => n !== 1),
        (key, quantity) => {
          const result = getUnitLabel(key, quantity);
          expect(result).toBe(UNIT_METADATA[key].plural);
        },
      ),
      { numRuns: 100 },
    );
  });
});
