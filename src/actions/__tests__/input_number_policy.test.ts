import { parseBoundedPositiveIntegerInput, parseIntegerInput, parseNonNegativeIntegerInput } from '../input_number_policy';

describe('input number policy', () => {
  it('parses integer strings and numbers', () => {
        expect(parseIntegerInput('42', 0)).toBe(42);
    expect(parseIntegerInput(7, 0)).toBe(7);
  });

  it('rejects partial, decimal, exponential and unsafe integer values', () => {
    expect(parseIntegerInput('42abc', 9)).toBe(9);
    expect(parseIntegerInput('1.5', 9)).toBe(9);
    expect(parseIntegerInput('1e3', 9)).toBe(9);
    expect(parseIntegerInput(Number.MAX_SAFE_INTEGER + 1, 9)).toBe(9);
  });

  it('uses the fallback for negative timeout-like values', () => {
    expect(parseNonNegativeIntegerInput('-1', 600)).toBe(600);
    expect(parseNonNegativeIntegerInput(0, 600)).toBe(0);
  });

    it('parses and bounds positive integer inputs', () => {
        expect(parseBoundedPositiveIntegerInput('42', 100, 200)).toBe(42);
        expect(parseBoundedPositiveIntegerInput(500, 100, 200)).toBe(200);
        expect(parseBoundedPositiveIntegerInput(0, 100, 200)).toBe(100);
        expect(parseBoundedPositiveIntegerInput('invalid', 100, 200)).toBe(100);
    });
});
