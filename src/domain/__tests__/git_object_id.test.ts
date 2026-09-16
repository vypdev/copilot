import { canonicalGitObjectId } from '../git_object_id';

describe('git object id policy', () => {
    it.each([
        ['A'.repeat(40), 'a'.repeat(40)],
        [`  ${'B'.repeat(64)}  `, 'b'.repeat(64)],
    ])('canonicalizes supported object IDs', (value, expected) => {
        expect(canonicalGitObjectId(value)).toBe(expected);
    });

    it.each([
        undefined,
        42,
        '',
        'a'.repeat(39),
        'a'.repeat(41),
        'g'.repeat(40),
        '0'.repeat(40),
        '0'.repeat(64),
    ])('rejects invalid or null object IDs: %s', (value) => {
        expect(canonicalGitObjectId(value)).toBeUndefined();
    });
});
