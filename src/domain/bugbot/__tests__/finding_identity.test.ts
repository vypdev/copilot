import { buildFindingFingerprint } from '../finding_identity';

describe('finding identity', () => {
    it('is deterministic and independent of the model-provided id', () => {
        const first = buildFindingFingerprint({
            file: './src\\auth.ts',
            line: 21,
            title: 'Unchecked token',
            description: 'The token is used before validation.',
        });
        const second = buildFindingFingerprint({
            file: 'src/auth.ts',
            line: 22,
            title: 'Unchecked token',
            description: 'The token is used before validation.',
        });

        expect(first).toMatch(/^fp-[a-f0-9]{8}$/);
        expect(second).toBe(first);
    });

    it('changes when the semantic finding changes', () => {
        const original = buildFindingFingerprint({ file: 'src/a.ts', title: 'Missing null check' });
        const changed = buildFindingFingerprint({ file: 'src/a.ts', title: 'Wrong permission check' });

        expect(changed).not.toBe(original);
    });

    it('does not change when the provider rephrases the finding details', () => {
        const original = buildFindingFingerprint({
            file: 'src/auth.ts',
            line: 21,
            title: 'Unchecked token',
            description: 'The token is used before validation.',
            suggestion: 'Validate the token first.',
        });
        const rephrased = buildFindingFingerprint({
            file: 'src/auth.ts',
            line: 22,
            title: 'Unchecked token',
            description: 'Authentication data reaches this branch without a guard.',
            suggestion: 'Add a guard before using authentication data.',
        });

        expect(rephrased).toBe(original);
    });
});
