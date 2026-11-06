import { normalizeProgressCompletionDiagnostic } from '../progress_completion_diagnostic';
import { ProgressCompletionMismatch } from '../../application/errors/progress_completion_mismatch';
import { parseScopedProgressResponse, type ProgressScope } from '../../application/policies/progress_scope_policy';
import { progressCompletionCountsMatchScope } from '../../application/policies/progress_completion_recovery_policy';

const facts = { reportedProgress: 70, requirementCount: 2, supportedCount: 2, missingCount: 0, unknownCount: 0 };
const scope = (count = 2, uncertain = false): ProgressScope => ({ requirements: Array.from({ length: count }, (_, i) =>
    ({ id: `R${i + 1}`, quote: 'Owned source', ...(uncertain && i === 1 ? { uncertain: true as const } : {}) })), exclusions: [] });
function response(progress = 70, status = 'supported') {
    return { outputLocale: 'en-US', progress, requirements: ['R1', 'R2'].map((id, i) => ({ id, status: i === 1 ? status : 'supported',
        evidence: i === 1 && status !== 'supported' ? 'external-unverified' : 'source-only', summary: 'PRIVATE_VALIDATED_MODEL_PROSE',
        remaining: i === 1 && status !== 'supported' ? 'Verification remains unknown.' : null })) };
}
function mismatch(output = response(), currentScope = scope()) {
    try { parseScopedProgressResponse(output, 'en-US', currentScope); throw new Error('Expected completed mismatch'); }
    catch (error) { expect(error).toBeInstanceOf(ProgressCompletionMismatch); return error as ProgressCompletionMismatch; }
}
it('github-communication-experience-change-C125: host parser captures all-supported reported70 privately while preserving its public rejection', () => {
    const current = scope(), error = mismatch(response(), current);
    expect(error.factsFor(current)).toEqual(facts); expect(Object.isFrozen(error.factsFor(current))).toBe(true);
    expect(error.recovery).toEqual({ id: 'progress-result-contract-invalid', variables: {
        phase: 'assessment', reason: 'progress-completion-mismatch', field: '$.progress', requirementId: 'none', sourceLineId: 'none',
    } });
    expect(JSON.stringify(error)).not.toMatch(/reportedProgress|supportedCount|PRIVATE_/u);
    expect(error.factsFor(scope())).toBeUndefined();
});
it('github-communication-experience-change-C126: false completion with a missing requirement yields exact current counts', () => {
    const current = scope(); expect(mismatch(response(100, 'missing'), current).factsFor(current))
        .toEqual({ ...facts, reportedProgress: 100, supportedCount: 1, missingCount: 1 });
});
it('github-communication-experience-change-C127: host uncertainty remains unknown in contradiction facts', () => {
    const current = scope(2, true); expect(mismatch(response(100, 'verification-unknown'), current).factsFor(current))
        .toEqual({ ...facts, reportedProgress: 100, supportedCount: 1, unknownCount: 1 });
});
it('github-communication-experience-change-C128: captures reported99.9 without rounding it into completion', () => {
    const current = scope(); expect(mismatch(response(99.9), current).factsFor(current)?.reportedProgress).toBe(99.9);
});
it('github-communication-experience-change-C129: valid boundaries1/32 and unsupported caller scopes keep direct rejection compatible', () => {
    for (const count of [1, 32]) {
        const current = scope(count), output = { outputLocale: 'en-US', progress: 70, requirements: current.requirements.map(({ id }) =>
            ({ id, status: 'supported', evidence: 'source-only', summary: 'Source.', remaining: null })) };
        expect(mismatch(output as ReturnType<typeof response>, current).factsFor(current)?.requirementCount).toBe(count);
    }
    for (const count of [0, 33]) {
        const current = scope(count), output = { outputLocale: 'en-US', progress: 70, requirements: current.requirements.map(({ id }) =>
            ({ id, status: 'supported', evidence: 'source-only', summary: 'Source.', remaining: null })) };
        expect(() => parseScopedProgressResponse(output, 'en-US', current)).toThrow(expect.objectContaining({ recovery: {
            id: 'progress-result-contract-invalid', variables: expect.objectContaining({ reason: 'progress-completion-mismatch' }),
        } }));
    }
});
it('github-communication-experience-change-C130: invalid percentages cannot authorize replacement or echo values', () => {
    for (const reportedProgress of [NaN, Infinity, -Infinity, -1, 100.1, 'PRIVATE_VALUE', null, undefined]) {
        expect(() => normalizeProgressCompletionDiagnostic({ ...facts, reportedProgress })).toThrow(TypeError);
    }
    expect(normalizeProgressCompletionDiagnostic({ ...facts, reportedProgress: 0 }).reportedProgress).toBe(0);
});
it('github-communication-experience-change-C131: negative, fractional, nonnumeric and excessive counts fail closed', () => {
    for (const field of ['requirementCount', 'supportedCount', 'missingCount', 'unknownCount']) {
        for (const value of [-1, 0.5, 33, NaN, Infinity, 'PRIVATE_COUNT']) {
            expect(() => normalizeProgressCompletionDiagnostic({ ...facts, [field]: value })).toThrow(TypeError);
        }
    }
    expect(() => normalizeProgressCompletionDiagnostic({ ...facts, requirementCount: 0 })).toThrow(TypeError);
});
it('github-communication-experience-change-C132: otherwise bounded counts must sum exactly to the total', () => {
    expect(() => normalizeProgressCompletionDiagnostic({ ...facts, supportedCount: 1 })).toThrow(TypeError);
});
it('github-communication-experience-change-C133: a foreign scope identity cannot consume another assessment mismatch', () => {
    const current = scope(), error = mismatch(response(), current);
    expect(error.factsFor({ ...current })).toBeUndefined(); expect(error.factsFor(scope(1))).toBeUndefined();
    expect(error.factsFor(current)).toEqual(facts);
    expect(progressCompletionCountsMatchScope(facts, 2, 0)).toBe(true);
    expect(progressCompletionCountsMatchScope(facts, 1, 0)).toBe(false);
    expect(progressCompletionCountsMatchScope(facts, 2, 1)).toBe(false);
    for (const count of [-1, 0, 33, 0.5, NaN, '2']) {
        expect(progressCompletionCountsMatchScope(facts, count as number, 0)).toBe(false);
    }
    for (const unknown of [-1, 0.5, Infinity, 3]) expect(progressCompletionCountsMatchScope(facts, 2, unknown)).toBe(false);
});
it('github-communication-experience-change-C134: unknown/missing/hidden keys reject and normalized facts do not reread getters', () => {
    for (const value of [null, [], 'PRIVATE_INPUT', 1, { ...facts, private: 'PRIVATE_EXTRA' }, { ...facts, reportedProgress: undefined }]) {
        expect(() => normalizeProgressCompletionDiagnostic(value)).toThrow(TypeError);
    }
    const missing: Partial<typeof facts> = { ...facts }; delete missing.unknownCount;
    expect(() => normalizeProgressCompletionDiagnostic(missing)).toThrow(TypeError);
    const swapped = { ...facts, private: 0 } as Record<string, unknown>; delete swapped.unknownCount;
    expect(() => normalizeProgressCompletionDiagnostic(swapped)).toThrow(TypeError);
    for (const key of ['hidden', Symbol('PRIVATE_SYMBOL')]) {
        const extra = { ...facts }; Object.defineProperty(extra, key, { value: 'PRIVATE_EXTRA', enumerable: false });
        expect(() => normalizeProgressCompletionDiagnostic(extra)).toThrow(TypeError);
    }
    const symbolic: Partial<typeof facts> = { ...facts }; delete symbolic.unknownCount;
    Object.defineProperty(symbolic, Symbol('PRIVATE_REPLACEMENT'), { value: 0 });
    expect(() => normalizeProgressCompletionDiagnostic(symbolic)).toThrow(TypeError);
    let reads = 0; const input = { ...facts, get reportedProgress() { return ++reads === 1 ? 70 : 'PRIVATE_CHANGED'; } };
    const normalized = normalizeProgressCompletionDiagnostic(input); expect(reads).toBe(1);
    expect(JSON.stringify(normalized)).not.toContain('PRIVATE_'); expect(Object.isFrozen(normalized)).toBe(true);
});
it('github-communication-experience-change-C135: consistent complete and incomplete values never classify as mismatches', () => {
    expect(() => normalizeProgressCompletionDiagnostic({ ...facts, reportedProgress: 100 })).toThrow(TypeError);
    expect(() => normalizeProgressCompletionDiagnostic({ ...facts, supportedCount: 1, missingCount: 1 })).toThrow(TypeError);
    expect(parseScopedProgressResponse(response(100), 'en-US', scope()).progress).toBe(100);
    expect(parseScopedProgressResponse(response(75, 'verification-unknown'), 'en-US', scope()).progress).toBe(75);
});
