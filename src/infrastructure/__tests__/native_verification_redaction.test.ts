import { nativeWorkerSecrets, redactNativeWorkerLogs } from '../native_verification_redaction';

describe('native worker private-log redaction', () => {
    afterEach(() => jest.restoreAllMocks());
    it('collects credentials from Action env and JSON input without treating metadata as secrets', () => {
        expect(nativeWorkerSecrets({ INPUT_TOKEN: 'pat-secret', OPENAI_API_KEY: 'model-secret', INPUT_VARS_JSON: '{"token":"json-secret","main-branch":"master"}', GITHUB_RUN_ID: '12345' }))
            .toEqual(expect.arrayContaining(['pat-secret', 'model-secret', 'json-secret']));
        expect(nativeWorkerSecrets({ GITHUB_RUN_ID: '12345', INPUT_VARS_JSON: 'invalid' })).toEqual([]);
    });
    it('redacts secrets spanning chunks before stdout reaches disk', () => {
        const writes: string[] = []; jest.spyOn(process.stdout, 'write').mockImplementation((data) => { writes.push(String(data)); return true; });
        const restore = redactNativeWorkerLogs({ INPUT_TOKEN: 'private-token' });
        process.stdout.write('prefix private-'); process.stdout.write('token suffix\n'); restore();
        expect(writes.join('')).toBe('prefix [REDACTED] suffix\n');
    });
    it('redacts stderr and flushes a final unterminated line', () => {
        const writes: string[] = []; jest.spyOn(process.stderr, 'write').mockImplementation(data => { writes.push(String(data)); return true; });
        const restore = redactNativeWorkerLogs({ MODEL_API_KEY: 'private-key' }); process.stderr.write(Buffer.from('private-key')); restore(); expect(writes.join('')).toBe('[REDACTED]');
    });
    it('consumes dynamic mask commands and never stores their payload', () => {
        const writes: string[] = []; jest.spyOn(process.stdout, 'write').mockImplementation(data => { writes.push(String(data)); return true; });
        const restore = redactNativeWorkerLogs({}); process.stdout.write('::add-mask::dynamic%25secret\n'); process.stdout.write('dynamic%secret\n'); restore();
        expect(writes.join('')).toBe('[REDACTED]\n');
    });
    it('supports multiline credentials and callbacks', () => {
        const writes: string[] = []; jest.spyOn(process.stdout, 'write').mockImplementation(data => { writes.push(String(data)); return true; });
        const restore = redactNativeWorkerLogs({ TOKEN: 'first-line\nsecond-line' }); const callback = jest.fn();
        process.stdout.write('first-line\nsecond-line\n', callback); process.stdout.write('ok\n', 'utf8', callback); restore();
        expect(writes.join('')).toBe('[REDACTED]\n[REDACTED]\nok\n'); expect(callback).toHaveBeenCalledTimes(2);
    });
    it('preserves split UTF-8 and ordinary operational logs', () => {
        const writes: string[] = []; jest.spyOn(process.stdout, 'write').mockImplementation(data => { writes.push(String(data)); return true; });
        const restore = redactNativeWorkerLogs({}); const bytes = Buffer.from('verificación\n');
        process.stdout.write(bytes.subarray(0, 12)); process.stdout.write(bytes.subarray(12)); restore(); expect(writes.join('')).toBe('verificación\n');
    });
    it('bounds an unterminated line', () => {
        jest.spyOn(process.stdout, 'write').mockReturnValue(true); const restore = redactNativeWorkerLogs({});
        expect(() => process.stdout.write('x'.repeat(1_048_577))).toThrow('fixed limit'); restore();
    });
});
