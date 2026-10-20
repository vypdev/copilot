import { parseVerificationRuntimeManifest, verificationRuntimeVersion, verificationRuntimeMatches,
    VerificationPrerequisiteError, type VerificationRuntimeId } from '../verification_runtime_policy';

describe('verification runtime declarations', () => {
    test.each([
        ['java', 'openjdk version "17.0.13" 2024-10-15', '17.0.13'],
        ['node', 'v24.4.0', '24.4.0'], ['pnpm', '10.12.4', '10.12.4'],
        ['python', 'Python 3.12.3', '3.12.3'], ['go', 'go version go1.24.1 linux/amd64', '1.24.1'],
        ['dotnet', '8.0.400', '8.0.400'], ['ruby', 'ruby 3.4.3 (release)', '3.4.3'],
        ['rust', 'rustc 1.85.0 (compiler build)', '1.85.0'],
    ] as const)('recognizes fixed %s output', (runtime, output, expected) => {
        expect(verificationRuntimeVersion(runtime, output)).toBe(expected);
    });
    test.each([
        'java version "1.8.0_452"', 'openjdk 8.0 2025-01-01',
    ])('normalizes legacy Java numeric prefixes: %s', output => {
        expect(verificationRuntimeVersion('java', output)).toBe('8.0');
    });
    test('accepts the initial Java major-only release output', () => {
        expect(verificationRuntimeVersion('java', 'openjdk version "17" 2021-09-14')).toBe('17');
    });
    test('does not interpret arbitrary provider text as version evidence', () => {
        expect(verificationRuntimeVersion('java', 'secret=17.0.1 private-output')).toBeUndefined();
    });
    test.each([
        ['17', '17', true], ['17', '17.0.13', true], ['17.0', '17.0.13', true],
        ['17', '170.0.1', false], ['3.12', '3.13.0', false], ['1.24.1', '1.24.2', false],
    ])('checks numeric version prefix %s against %s', (required, observed, expected) => {
        expect(verificationRuntimeMatches(required as string, observed as string)).toBe(expected);
    });
    test.each([
        null, [], {}, { schemaVersion: 2, runtimes: {} }, { schemaVersion: 1, runtimes: [] },
        { schemaVersion: 1, runtimes: { java: 17 } }, { schemaVersion: 1, runtimes: { shell: '17' } },
        { schemaVersion: 1, runtimes: { java: '17; private-secret' } },
        { schemaVersion: 1, runtimes: { java: '>=17' } },
        { schemaVersion: 1, runtimes: { java: '17' }, bootstrap: 'private-secret' },
        { schemaVersion: 1, runtimes: Object.fromEntries(Array.from({ length: 9 }, (_, n) => [`extra${n}`, '1'])) },
        { schemaVersion: 1, runtimes: { toString: '1' } },
    ])('rejects unknown or executable configuration without echoing it: %p', value => {
        expect(() => parseVerificationRuntimeManifest(value)).toThrow(VerificationPrerequisiteError);
        try { parseVerificationRuntimeManifest(value); } catch (error) { expect(String(error)).not.toContain('private-secret'); }
    });
    test('accepts a bounded mixed-stack declaration and freezes requirement records', () => {
        const requirements = parseVerificationRuntimeManifest({ schemaVersion: 1, runtimes: { java: '17', node: '24.4', pnpm: '10.12.4' } });
        expect(requirements).toEqual([{ runtime: 'java', version: '17' }, { runtime: 'node', version: '24.4' }, { runtime: 'pnpm', version: '10.12.4' }]);
        expect(Object.isFrozen(requirements[0])).toBe(true);
    });
    test('an explicit empty declaration imposes no runtime', () => {
        expect(parseVerificationRuntimeManifest({ schemaVersion: 1, runtimes: {} })).toEqual([]);
    });
    test.each(['unavailable', 'unreadable-version', 'version-mismatch'] as const)('renders safe %s recovery and job context', reason => {
        const error = new VerificationPrerequisiteError(reason, { runtime: 'java', version: '17' }, '21.0.1', 'copilot-issue-comment');
        expect(error.message).toContain('Java 17');
        expect(error.message).toContain('copilot-issue-comment');
        expect(error.message).toContain('same job');
        expect(error.message).toContain('verification command was not run');
    });
    test('does not echo forged diagnostic values or unsafe job text', () => {
        const error = new VerificationPrerequisiteError('version-mismatch',
            { runtime: 'private-secret' as VerificationRuntimeId, version: 'private-secret' }, 'private-secret', 'job\nprivate-secret');
        expect(error.message).not.toContain('private-secret');
        expect(error.message).toContain('Required runtime declared version');
    });
});
