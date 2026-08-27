import { parseDelimitedValues } from '../input_values_policy';

describe('input values policy', () => {
    it('trims values and removes empty entries', () => {
        expect(parseDelimitedValues(' one, ,two ,, three ')).toEqual(['one', 'two', 'three']);
    });

    it('handles missing values', () => {
        expect(parseDelimitedValues(undefined)).toEqual([]);
    });
});
