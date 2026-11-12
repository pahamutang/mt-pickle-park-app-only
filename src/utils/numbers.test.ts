import { MAX_MONEY, parseMoney, parseWholeNumber } from './numbers';

describe('parseMoney', () => {
  it('accepts plain amounts, decimals and thousands commas', () => {
    expect(parseMoney('250')).toBe(250);
    expect(parseMoney('250.50')).toBe(250.5);
    expect(parseMoney('.5')).toBe(0.5);
    expect(parseMoney('1,250')).toBe(1250);
    expect(parseMoney('  40 ')).toBe(40);
    expect(parseMoney('0')).toBe(0);
  });

  it('rejects the things parseFloat quietly lets through', () => {
    expect(parseMoney('Infinity')).toBeNull();
    expect(parseMoney('1e999')).toBeNull();
    expect(parseMoney('12abc')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('NaN')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('.')).toBeNull();
    expect(parseMoney('1.2.3')).toBeNull();
    expect(parseMoney('₱50')).toBeNull();
  });

  it('enforces the upper limit', () => {
    expect(parseMoney(String(MAX_MONEY))).toBe(MAX_MONEY);
    expect(parseMoney(String(MAX_MONEY + 1))).toBeNull();
    expect(parseMoney('9'.repeat(400))).toBeNull();
  });
});

describe('parseWholeNumber', () => {
  it('accepts whole numbers in range', () => {
    expect(parseWholeNumber('1')).toBe(1);
    expect(parseWholeNumber(' 12 ')).toBe(12);
    expect(parseWholeNumber('999')).toBe(999);
  });

  it('rejects decimals, signs, text and out-of-range values', () => {
    expect(parseWholeNumber('2.5')).toBeNull();
    expect(parseWholeNumber('0')).toBeNull();
    expect(parseWholeNumber('-3')).toBeNull();
    expect(parseWholeNumber('3x')).toBeNull();
    expect(parseWholeNumber('1000')).toBeNull();
    expect(parseWholeNumber('')).toBeNull();
  });
});
