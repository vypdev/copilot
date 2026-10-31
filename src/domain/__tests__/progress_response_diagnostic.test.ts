import { PROGRESS_RESPONSE_REASONS, ProgressResponseContractFailure, isProgressResponseDiagnosticFacts, isProgressRequirementId,
    isProgressSourceLineId, isProgressResponseField, safeProgressResponseField, type ProgressResponseDiagnosticFacts, type ProgressResponsePhase } from '../progress_response_diagnostic';

function facts(phase: ProgressResponsePhase = 'assessment'): ProgressResponseDiagnosticFacts {
    if (phase === 'scope') return { phase, reason: 'scope-source-id-invalid', field: '$.lines[0].id', requirementId: 'none', sourceLineId: 'L1' };
    if (phase === 'partition') return { phase, reason: 'partition-id-invalid', field: '$.partitionId', requirementId: 'none', sourceLineId: 'none' };
    return { phase, reason: 'requirement-evidence-invalid', field: '$.requirements[0].evidence', requirementId: 'R2', sourceLineId: 'L7' };
}
it.each(['scope', 'partition', 'assessment'] as const)('accepts every reviewed %s reason with a bounded immutable record', phase => {
    for (const reason of PROGRESS_RESPONSE_REASONS[phase]) {
        const input = { ...facts(phase), reason }, failure = new ProgressResponseContractFailure(input);
        expect(isProgressResponseDiagnosticFacts(input)).toBe(true); expect(Object.isFrozen(failure.facts)).toBe(true);
        expect(Buffer.byteLength(JSON.stringify(failure.facts))).toBeLessThanOrEqual(512);
    }
});
it.each([null, undefined, [], 'model text', 1])('rejects non-record diagnostic data %#', value => {
    expect(isProgressResponseDiagnosticFacts(value)).toBe(false);
    expect(() => new ProgressResponseContractFailure(value as never)).toThrow('Progress response diagnostic is invalid.');
});
it.each([
    ['phase', 'PRIVATE_PHASE'], ['phase', null], ['reason', 'PRIVATE_REASON'], ['reason', 'scope-budget'],
    ['field', '$.PRIVATE_MODEL_FIELD'], ['field', '$.requirements[32].id'], ['field', '$.requirements[00].id'],
    ['field', '$.requirements[0].id\n'], ['field', '$.requirements[0].id<script>'],
    ['requirementId', 'R0'], ['requirementId', 'R33'], ['requirementId', 'r1'], ['requirementId', 'R01'],
    ['requirementId', 'R2\n'], ['requirementId', '@all'], ['requirementId', 2],
    ['sourceLineId', 'L0'], ['sourceLineId', 'L524290'], ['sourceLineId', 'l7'], ['sourceLineId', 'L07'],
    ['sourceLineId', 'L7\n'], ['sourceLineId', 'PRIVATE_SOURCE'],
])('rejects unreviewed or malformed %s %#', (key, value) => {
    const record = { ...facts(), [key]: value }; expect(isProgressResponseDiagnosticFacts(record)).toBe(false);
    expect(() => new ProgressResponseContractFailure(record as never)).toThrow('Progress response diagnostic is invalid.');
});
it.each(['phase', 'reason', 'field', 'requirementId', 'sourceLineId'])('requires the exact %s field', key => {
    const record = { ...facts() } as Record<string, unknown>; delete record[key]; expect(isProgressResponseDiagnosticFacts(record)).toBe(false);
});
it('refuses extra producer data instead of serializing it as detail', () => {
    expect(isProgressResponseDiagnosticFacts({ ...facts(), raw: 'PRIVATE_RESPONSE' })).toBe(false);
});
it('does not attach an original-line identity without a verified requirement', () => {
    expect(isProgressResponseDiagnosticFacts({ ...facts(), requirementId: 'none' })).toBe(false);
    expect(isProgressResponseDiagnosticFacts({ ...facts(), requirementId: 'none', sourceLineId: 'none' })).toBe(true);
});
it('keeps global failures independent from individual requirement identities', () => {
    expect(isProgressResponseDiagnosticFacts({ ...facts(), field: '$.progress' })).toBe(false);
    expect(isProgressResponseDiagnosticFacts({ ...facts(), field: '$', requirementId: 'none', sourceLineId: 'none' })).toBe(true);
});
it('permits a known requirement with an explicitly unavailable line anchor', () => {
    expect(isProgressResponseDiagnosticFacts({ ...facts(), sourceLineId: 'none' })).toBe(true);
});
it.each(['requirementId', 'sourceLineId'])('never grants a %s to a partition diagnostic', key => {
    expect(isProgressResponseDiagnosticFacts({ ...facts('partition'), [key]: key === 'requirementId' ? 'R1' : 'L1' })).toBe(false);
});
it('does not infer requirement IDs from scope classification positions', () => {
    expect(isProgressResponseDiagnosticFacts({ ...facts('scope'), requirementId: 'R1' })).toBe(false);
    expect(isProgressResponseDiagnosticFacts({ ...facts('scope'), field: '$.outputLocale' })).toBe(false);
    expect(isProgressResponseDiagnosticFacts({ ...facts('scope'), sourceLineId: 'none' })).toBe(true);
});
it.each([
    ['R1', true, false], ['R32', true, false], ['R33', false, false], ['L1', false, true], ['L1024', false, true],
    ['L524289', false, true], ['L524290', false, false], ['R01', false, false], ['R1\n', false, false], ['L1\n', false, false], [null, false, false],
])('recognizes only canonical host identities %#', (value, requirement, line) => {
    expect(isProgressRequirementId(value)).toBe(requirement); expect(isProgressSourceLineId(value)).toBe(line);
});
it.each([
    ['scope', '$.lines[1023].kind', true], ['scope', '$.lines[1024].id', false], ['scope', '$.lines[0].PRIVATE', false],
    ['partition', '$.files[511].unitId', true], ['partition', '$.files[512].path', false], ['partition', '$.partitionId', true],
    ['assessment', '$.requirements[31].remaining', true], ['assessment', '$.requirements[32].id', false],
    ['assessment', '$.outputLocale', true], ['assessment', '$', true], ['assessment', undefined, false],
])('bounds fields by their current phase %#', (phase, field, valid) => {
    expect(isProgressResponseField(phase as ProgressResponsePhase, field)).toBe(valid);
    expect(safeProgressResponseField(phase as ProgressResponsePhase, field)).toBe(valid ? field : '$');
});
it('copies safe facts without retaining later caller mutation or raw payloads', () => {
    const input = { ...facts() }, error = new ProgressResponseContractFailure(input); input.field = '$.requirements[1].summary';
    expect(error.facts.field).toBe('$.requirements[0].evidence'); expect(Object.keys(error).sort()).toEqual(['facts', 'name']);
});
