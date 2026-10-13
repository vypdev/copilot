import { buildOperationEvidenceMarker, OPERATION_OUTCOMES, readOperationEvidence, validateOperationEvidence } from '../copilot_operation';
const base = { version: 1, target: 'pr:42', correlationId: 'comment:10', command: 'fix', outcome: 'applied' };
const body = (value: unknown) => `<!-- copilot:operation:v1 ${JSON.stringify(value)} -->`;
describe('closed trusted operation evidence', () => {
    it.each(OPERATION_OUTCOMES)('preserves the distinct outcome %s', outcome => expect(readOperationEvidence(body({ ...base, outcome }))?.outcome).toBe(outcome));
    it.each([
        null, [], {}, { ...base, version: 2 }, { ...base, target: 'pr:0' }, { ...base, target: 'issue:01' },
        { ...base, target: 'pr:9999999999999999999' }, { ...base, correlationId: 'comment:0' },
        { ...base, correlationId: 'run:10' }, { ...base, command: 'status' }, { ...base, outcome: 'complete' },
        { ...base, prompt: 'SECRET' }, { ...base, commitSha: 'a'.repeat(39) }, { ...base, commitSha: 'A'.repeat(40) },
        { ...base, commitSha: undefined }, { ...base, commitSha: 'a'.repeat(40), outcome: 'failed' },
    ])('rejects malformed or extra evidence %#', value => expect(validateOperationEvidence(value)).toBeUndefined());
    it('rejects an unknown marker version rather than inferring from prose', () => expect(readOperationEvidence(body(base).replace(':v1', ':v2'))).toBeUndefined());
    it('rejects oversized and repeated markers', () => {
        expect(readOperationEvidence(body({ ...base, target: 'x'.repeat(1201) }))).toBeUndefined();
        expect(readOperationEvidence(body(base) + body(base))).toBeUndefined();
    });
    it('rejects malformed JSON', () => expect(readOperationEvidence('<!-- copilot:operation:v1 { -->')).toBeUndefined());
    it('emits a SHA only after exact trusted post-push agreement', () => {
        const value = { target: 'pr:42', correlationId: 'comment:10', command: 'fix' as const, outcome: 'applied' as const };
        expect(readOperationEvidence(buildOperationEvidenceMarker(value, { localSha: 'a'.repeat(40), remoteSha: 'a'.repeat(40) }))?.commitSha).toBe('a'.repeat(40));
        expect(readOperationEvidence(buildOperationEvidenceMarker(value, { localSha: 'a'.repeat(40), remoteSha: 'b'.repeat(40) }))?.commitSha).toBeUndefined();
    });
    it('omits any unverified SHA, including invalid local and non-pushed outcomes', () => {
        const value = { target: 'issue:42', correlationId: 'comment:10', command: 'remember' as const, outcome: 'already-current' as const };
        expect(readOperationEvidence(buildOperationEvidenceMarker(value))?.commitSha).toBeUndefined();
        expect(readOperationEvidence(buildOperationEvidenceMarker(value, { localSha: 'invalid', remoteSha: 'invalid' }))?.commitSha).toBeUndefined();
    });
    it('rejects an invalid trusted producer binding', () => expect(() => buildOperationEvidenceMarker({ target: 'pr:0', correlationId: 'comment:10', command: 'fix', outcome: 'applied' })).toThrow('Invalid operation evidence'));
});
