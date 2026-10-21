import { parseVerificationSetupResult, VerificationSetupError, VERIFICATION_SETUP_LIMITS, VERIFICATION_SETUP_PATH } from '../verification_setup_policy';

describe('repository verification setup policy', () => {
    it('fixes the helper and limits without caller overrides', () => {
        expect(VERIFICATION_SETUP_PATH).toBe('.copilot/verification-setup.mjs');
        expect(VERIFICATION_SETUP_LIMITS).toEqual({ timeoutMs: 300_000, outputBytes: 65_536, resultBytes: 16_384, scriptBytes: 65_536 });
        expect(Object.isFrozen(VERIFICATION_SETUP_LIMITS)).toBe(true);
    });
    it.each([
        [{ schemaVersion: 1 }, { path: [] }],
        [{ schemaVersion: 1, path: ['/tools/bin'] }, { path: ['/tools/bin'] }],
        [{ schemaVersion: 1, environment: { JAVA_HOME: '/tools/java' } }, { path: [], javaHome: '/tools/java' }],
    ])('accepts closed protocol v1 output %j', (input, expected) => {
        const parsed = parseVerificationSetupResult(input);
        expect(parsed).toEqual(expected);
        expect(Object.isFrozen(parsed)).toBe(true);
        expect(Object.isFrozen(parsed.path)).toBe(true);
    });
    it.each([
        null, [], false, 'value', {}, { schemaVersion: 2 }, { schemaVersion: 1, timeout: 1 },
        { schemaVersion: 1, path: 'bin' }, { schemaVersion: 1, path: null }, { schemaVersion: 1, environment: null }, { schemaVersion: 1, path: Array(9).fill('/bin') },
        { schemaVersion: 1, path: ['/bin', '/bin'] }, { schemaVersion: 1, path: [''] },
        { schemaVersion: 1, path: [false] }, { schemaVersion: 1, path: ['a'.repeat(2049)] },
        { schemaVersion: 1, path: ['line\nbreak'] }, { schemaVersion: 1, environment: [] },
        { schemaVersion: 1, environment: 'env' }, { schemaVersion: 1, environment: { HOME: '/tmp' } },
        { schemaVersion: 1, environment: { NODE_OPTIONS: '--require candidate' } },
        { schemaVersion: 1, environment: { JAVA_HOME: '' } }, { schemaVersion: 1, environment: { JAVA_HOME: 3 } },
    ])('rejects invalid or unrestricted output %j', input => {
        expect(() => parseVerificationSetupResult(input)).toThrow(expect.objectContaining({ reason: 'result-invalid' }));
    });
    it('reports only fixed facts and safe pinned source/exit metadata', () => {
        expect(new VerificationSetupError('timeout', 'a'.repeat(40), 7).message).toContain('Exit status: 7');
        const error = new VerificationSetupError('source-unavailable', 'secret\n@everyone', 999);
        expect(error.message).toContain('Trusted source SHA: unavailable');
        expect(error.message).toContain('Verification, commit and push are withheld');
        expect(error.message).not.toMatch(/secret|@everyone|999/);
        expect(error).not.toHaveProperty('cause');
    });
});
