import { formatQuantity, parseFractionalQuantity } from '../quantity';

describe('formatQuantity', () => {
  it('returns "0" for zero', () => {
    expect(formatQuantity(0)).toBe('0');
  });

  it('returns whole number strings for integers', () => {
    expect(formatQuantity(1)).toBe('1');
    expect(formatQuantity(2)).toBe('2');
  });

  it('returns "2" for 2.0 (whole number)', () => {
    expect(formatQuantity(2.0)).toBe('2');
  });

  it('formats simple fractions without leading zero', () => {
    expect(formatQuantity(0.5)).toBe('1/2');
    expect(formatQuantity(0.25)).toBe('1/4');
  });

  it('formats mixed numbers', () => {
    expect(formatQuantity(1.5)).toBe('1 1/2');
    expect(formatQuantity(2.75)).toBe('2 3/4');
  });

  it('matches 1/3 within tolerance', () => {
    expect(formatQuantity(0.333)).toBe('1/3');
  });

  it('treats negative values as their absolute value', () => {
    expect(formatQuantity(-1.5)).toBe('1 1/2');
  });

  it('falls back to 2 decimal places when no fraction matches', () => {
    expect(formatQuantity(1.99)).toBe('1.99');
  });
});

describe('parseFractionalQuantity', () => {
  it('parses whole number strings', () => {
    expect(parseFractionalQuantity('1')).toBe(1);
  });

  it('parses simple fractions', () => {
    expect(parseFractionalQuantity('1/2')).toBe(0.5);
  });

  it('parses mixed numbers', () => {
    expect(parseFractionalQuantity('1 1/2')).toBe(1.5);
    expect(parseFractionalQuantity('2 3/4')).toBe(2.75);
  });

  it('returns null for empty string', () => {
    expect(parseFractionalQuantity('')).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(parseFractionalQuantity('abc')).toBeNull();
  });

  it('returns null for zero (not positive)', () => {
    expect(parseFractionalQuantity('0')).toBeNull();
  });

  it('returns null for negative numbers (not positive)', () => {
    expect(parseFractionalQuantity('-1')).toBeNull();
  });
});
