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
});
