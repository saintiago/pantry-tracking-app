import {
  VALID_UNITS,
  LEGACY_UNIT_MAP,
  UNIT_METADATA,
  resolveUnit,
  getUnitLabel,
  getUnitAbbreviation,
} from '../units';

describe('VALID_UNITS', () => {
  it('contains exactly 17 entries', () => {
    expect(VALID_UNITS).toHaveLength(17);
  });

  it('contains all expected unit keys', () => {
    const expected = [
      'tsp',
      'tbsp',
      'cup',
      'ml',
      'l',
      'g',
      'kg',
      'piece',
      'slice',
      'clove',
      'pinch',
      'handful',
      'stick',
      'can',
      'bottle',
      'zest',
      'unit',
    ];
    expect(VALID_UNITS).toEqual(expect.arrayContaining(expected));
  });

  it('is sorted alphabetically by singular label', () => {
    const labels = VALID_UNITS.map((unit) => UNIT_METADATA[unit].singular);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe('LEGACY_UNIT_MAP', () => {
  it('contains exactly 5 entries', () => {
    expect(Object.keys(LEGACY_UNIT_MAP)).toHaveLength(5);
  });

  it('maps Gram to g', () => {
    expect(LEGACY_UNIT_MAP['Gram']).toBe('g');
  });

  it('maps Kilo to kg', () => {
    expect(LEGACY_UNIT_MAP['Kilo']).toBe('kg');
  });

  it('maps Milliliter to ml', () => {
    expect(LEGACY_UNIT_MAP['Milliliter']).toBe('ml');
  });

  it('maps Liter to l', () => {
    expect(LEGACY_UNIT_MAP['Liter']).toBe('l');
  });

  it('maps Unit to piece', () => {
    expect(LEGACY_UNIT_MAP['Unit']).toBe('piece');
  });
});

describe('UNIT_METADATA', () => {
  it('has correct metadata for tsp', () => {
    expect(UNIT_METADATA['tsp']).toEqual({
      key: 'tsp',
      singular: 'teaspoon',
      abbreviation: 'tsp',
      plural: 'teaspoons',
    });
  });

  it('has correct metadata for cup', () => {
    expect(UNIT_METADATA['cup']).toEqual({
      key: 'cup',
      singular: 'cup',
      abbreviation: 'c',
      plural: 'cups',
    });
  });
});

describe('resolveUnit', () => {
  it('returns the key unchanged for valid new unit keys', () => {
    for (const unit of VALID_UNITS) {
      expect(resolveUnit(unit)).toBe(unit);
    }
  });

  it('resolves legacy key Gram to g', () => {
    expect(resolveUnit('Gram')).toBe('g');
  });

  it('resolves legacy key Kilo to kg', () => {
    expect(resolveUnit('Kilo')).toBe('kg');
  });

  it('resolves legacy key Milliliter to ml', () => {
    expect(resolveUnit('Milliliter')).toBe('ml');
  });

  it('resolves legacy key Liter to l', () => {
    expect(resolveUnit('Liter')).toBe('l');
  });

  it('resolves legacy key Unit to piece', () => {
    expect(resolveUnit('Unit')).toBe('piece');
  });

  it('returns "piece" for unknown keys', () => {
    expect(resolveUnit('unknown-key')).toBe('piece');
    expect(resolveUnit('')).toBe('piece');
    expect(resolveUnit('Ounce')).toBe('piece');
  });
});

describe('getUnitLabel', () => {
  it('returns singular label when quantity is 1', () => {
    expect(getUnitLabel('cup', 1)).toBe('cup');
    expect(getUnitLabel('tsp', 1)).toBe('teaspoon');
    expect(getUnitLabel('g', 1)).toBe('gram');
  });

  it('returns plural label when quantity is 2', () => {
    expect(getUnitLabel('cup', 2)).toBe('cups');
    expect(getUnitLabel('tsp', 2)).toBe('teaspoons');
    expect(getUnitLabel('g', 2)).toBe('grams');
  });

  it('returns plural label for fractional quantity less than 1', () => {
    expect(getUnitLabel('cup', 0.5)).toBe('cups');
    expect(getUnitLabel('tsp', 0.25)).toBe('teaspoons');
  });

  it('returns plural label for quantity 0', () => {
    expect(getUnitLabel('cup', 0)).toBe('cups');
  });

  it('resolves legacy keys before returning label', () => {
    expect(getUnitLabel('Gram', 1)).toBe('gram');
    expect(getUnitLabel('Gram', 2)).toBe('grams');
    expect(getUnitLabel('Unit', 1)).toBe('piece');
    expect(getUnitLabel('Unit', 3)).toBe('pieces');
  });
});

describe('getUnitAbbreviation', () => {
  it('returns tsp for tsp', () => {
    expect(getUnitAbbreviation('tsp')).toBe('tsp');
  });

  it('returns c for cup', () => {
    expect(getUnitAbbreviation('cup')).toBe('c');
  });

  it('returns g for g', () => {
    expect(getUnitAbbreviation('g')).toBe('g');
  });

  it('returns kg for kg', () => {
    expect(getUnitAbbreviation('kg')).toBe('kg');
  });

  it('resolves legacy keys before returning abbreviation', () => {
    expect(getUnitAbbreviation('Gram')).toBe('g');
    expect(getUnitAbbreviation('Unit')).toBe('pc');
  });
});
