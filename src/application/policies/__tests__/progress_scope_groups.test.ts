import { planProgressScopeGroups, progressScopeData, type ProgressAssessmentBatch } from '../progress_batch_policy';
import { MAX_PROGRESS_SCOPE_BYTES, type ProgressScope } from '../progress_scope_policy';

function scope(count: number, quote = 'q'.repeat(600)): ProgressScope {
    return { requirements: Array.from({ length: count }, (_, index) => ({ id: `R${index + 1}`, quote,
        sources: [{ id: `L${index + 1}`, origin: 'issue' as const, quote: 'Original retained host quote.' }] })), exclusions: [] };
}
function batches(value: ProgressScope): ProgressAssessmentBatch[] {
    return Array.from({ length: Math.ceil(value.requirements.length / 32) }, (_, index) => ({
        id: `batch-${index + 1}`, ordinal: index + 1, scope: { ...value, requirements: value.requirements.slice(index * 32, (index + 1) * 32) },
    }));
}
it('progress-groups-1000 retains one byte-identical complete scope when all batches fit', () => {
    const value = scope(33), assignments = batches(value), result = planProgressScopeGroups(value, assignments);
    expect(result).toEqual([{ acceptanceScope: progressScopeData(value), batches: assignments }]);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result[0])).toBe(true); expect(Object.isFrozen(result[0].batches)).toBe(true);
});
it('progress-groups-1000 packs maximal consecutive complete batches with every requirement exactly once', () => {
    const value = scope(224), assignments = batches(value), result = planProgressScopeGroups(value, assignments);
    expect(result.map(group => group.batches.length)).toEqual([3, 2, 2]);
    expect(result.flatMap(group => group.batches)).toEqual(assignments);
    expect(result.flatMap(group => JSON.parse(group.acceptanceScope).requirements.map((entry: { id: string }) => entry.id)))
        .toEqual(value.requirements.map(entry => entry.id));
    expect(assignments.map(batch => batch.scope.requirements.length)).toEqual([32, 32, 32, 32, 32, 32, 32]);
});
it('progress-groups-1000 admits exactly 64000 UTF-8 bytes without changing the request ceiling', () => {
    const value = scope(96, 'q'.repeat(900));
    const first = { ...value, requirements: value.requirements.slice(0, 64) };
    let missing = MAX_PROGRESS_SCOPE_BYTES - Buffer.byteLength(progressScopeData(first), 'utf8');
    expect(missing).toBeGreaterThan(0);
    for (const entry of first.requirements) {
        const extra = Math.min(missing, 1200 - entry.quote.length);
        (entry as { quote: string }).quote += 'q'.repeat(extra); missing -= extra;
    }
    expect(missing).toBe(0);
    const groups = planProgressScopeGroups(value, batches(value));
    expect(Buffer.byteLength(groups[0].acceptanceScope, 'utf8')).toBe(64_000);
    expect(groups.map(group => group.batches.length)).toEqual([2, 1]);
});
it('progress-groups-1000 accounts for Unicode UTF-8 bytes rather than string length', () => {
    const value = scope(64, '😀'.repeat(300)), groups = planProgressScopeGroups(value, batches(value));
    expect(progressScopeData(value).length).toBeLessThan(64_000);
    expect(Buffer.byteLength(progressScopeData(value), 'utf8')).toBeGreaterThan(64_000);
    expect(groups.map(group => group.batches.length)).toEqual([1, 1]);
});
it('progress-groups-1000 repeats every exclusion and publication identity in each bounded group', () => {
    const value: ProgressScope = { ...scope(128), exclusions: [{ id: 'X1', quote: 'No human platform requirement.' }],
        publication: { issueUrl: 'https://github.com/owner/repo/issues/1000', cardId: 2, path: 'specs/owner.md', commitSha: 'a'.repeat(40), artifactHash: 'b'.repeat(64) } };
    const original = structuredClone(value), groups = planProgressScopeGroups(value, batches(value));
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) expect(JSON.parse(group.acceptanceScope)).toMatchObject({ exclusions: value.exclusions, publication: value.publication });
    expect(value).toEqual(original);
});
it('progress-groups-1000 retains full requirement qualifiers and aliases without repeating source quotes', () => {
    const value = scope(33), first = value.requirements[0];
    (first as { uncertain?: true }).uncertain = true;
    (first.sources as { id: string; origin: 'draft'; quote: string }[]).push({ id: 'L99', origin: 'draft', quote: 'Host case qualifier.' });
    const encoded = JSON.parse(planProgressScopeGroups(value, batches(value))[0].acceptanceScope);
    expect(encoded.requirements[0]).toEqual({ id: first.id, quote: first.quote, uncertain: true,
        sources: [{ id: 'L1', origin: 'issue' }, { id: 'L99', origin: 'draft' }] });
    expect(first.sources?.[1].quote).toBe('Host case qualifier.');
});
it('progress-groups-1000 rejects one oversized complete batch without splitting or clipping it', () => {
    const value = scope(32, '😀'.repeat(600)), original = structuredClone(value);
    expect(() => planProgressScopeGroups(value, batches(value))).toThrow(expect.objectContaining({ diagnostic: expect.objectContaining({
        phase: 'scope', dimension: 'input-text-bytes', supportedLimit: 64_000,
    }) }));
    expect(value).toEqual(original);
});
it('progress-groups-1000 creates no extraction group for an empty internal assignment inventory', () => {
    expect(planProgressScopeGroups(scope(0), [])).toEqual([]);
});
