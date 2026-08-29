import { parseBoundedPositiveIntegerInput, parseIntegerInput, parseNonNegativeIntegerInput } from '../input_number_policy';

describe('input number policy', () => {
    it('parses integer strings and numbers', () => {
        expect(parseIntegerInput('42', 0)).toBe(42);
    expect(parseIntegerInput(7, 0)).toBe(7);
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
