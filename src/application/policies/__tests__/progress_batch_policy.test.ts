import { createHash } from 'node:crypto';
import { projectCodexOutputSchema } from '../agent_execution/codex_output_schema_policy';
import { captureProgressScopeSource } from '../progress_scope_source_policy';
import { parseProgressScopeWithAnchors, parseProgressScopeClassifications } from '../progress_scope_policy';
import { partitionProgressDiff } from '../progress_diff_partition_policy';
import { aggregateProgressAssessmentReceipts, createProgressScopeManifest, parseProgressAssessmentReceipt, planProgressAssessmentBatches,
    PROGRESS_BATCH_PROFILE, progressGroups, progressBatchResponseSchema, progressScopeSnapshotDigest, progressClassificationBinding, progressClassificationResponseSchema, parseProgressClassificationReceipt } from '../progress_batch_policy';
import { boundProgressBatchAgent } from '../progress_batch_query_policy';
import { isProgressBatchDiagnostic } from '../../../domain/progress_batch_diagnostic';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';
import { buildApplicationErrorPresentation } from '../application_error_presentation_policy';
import { progressBatchRejected } from '../progress_batch_rejection_policy';

const base = 'a'.repeat(40), head = 'b'.repeat(40);
function fixture(count = 33) {
    const body = Array.from({ length: count }, (_, index) => `Distinct obligation ${index + 1}.`).join('\n');
    const source = captureProgressScopeSource(body);
    const classifications = source.lines.map(line => ({ id: line.id, kind: 'required' }));
    const extraction = parseProgressScopeWithAnchors({ outputLocale: 'en-US', lines: classifications }, source, 'en-US', PROGRESS_BATCH_PROFILE);
    const diff = partitionProgressDiff(base, head, [{ path: 'src/product.ts', status: 'modified', additions: 1, deletions: 0, patch: '+source' }]);
    const input = { capturedSource: source, classifications, repository: 'owner/repo', issueNumber: 916, issueDescription: body, comparisonSource: { kind: 'development' as const, baseBranch: 'develop' }, baseSha: base, headSha: head, scope: extraction.scope };
    const manifest = createProgressScopeManifest(input, diff);
    const batches = planProgressAssessmentBatches(manifest);
    const output = (index = 0) => ({ outputLocale: 'en-US', progress: 50, manifestDigest: manifest.digest, batchId: batches[index].id, headSha: head,
        requirements: batches[index].scope.requirements.map(requirement => ({ id: requirement.id, status: 'verification-unknown', evidence: 'external-unverified',
            summary: 'Source reviewed.', remaining: 'Execution unknown.', citations: [manifest.evidence[0].id] })) });
    const receipt = (index = 0, response = output(index)) => parseProgressAssessmentReceipt(response, manifest, batches[index], extraction.anchors, 'en-US', count > 32);
    return { source, extraction, diff, input, manifest, batches, output, receipt };
}
it('CommitScope916-C01 accounts for every assigned span and rejects missing or duplicate spans', () => {
    const f = fixture();
    for (const lines of progressGroups(f.source.lines, 16)) {
        const subset = { ...f.source, lines };
        const response = { outputLocale: 'en-US', lines: lines.map(line => ({ id: line.id, kind: 'context' })) };
        expect(parseProgressScopeClassifications(response, subset, 'en-US')).toHaveLength(lines.length);
        expect(() => parseProgressScopeClassifications({ ...response, lines: response.lines.slice(1) }, subset, 'en-US')).toThrow();
        expect(() => parseProgressScopeClassifications({ ...response, lines: (response.lines.length > 1 ? response.lines.map(() => response.lines[0]) : [response.lines[0], response.lines[0]]) }, subset, 'en-US')).toThrow();
    }
});
it('CommitScope916-C02 preserves source IDs and manifest identity across assignment sizes and retries', () => {
    const f = fixture();
    for (const size of [1, 8, 16, 32]) {
        expect(planProgressAssessmentBatches(f.manifest, size).flatMap(batch => batch.scope.requirements.map(requirement => requirement.id))).toEqual(f.manifest.scope.requirements.map(requirement => requirement.id));
    }
    expect(createProgressScopeManifest(f.input, f.diff).digest).toBe(f.manifest.digest);
    expect(createProgressScopeManifest({ ...f.input, classifications: [...f.input.classifications].reverse() }, f.diff).digest).toBe(f.manifest.digest);
    expect(f.manifest.issueDigest).toBe(createHash('sha256').update(f.input.issueDescription).digest('hex'));
});
it('CommitScope916-C02 gives a source the same ID when an earlier line changes classification', () => {
    const source = captureProgressScopeSource('Context.\nRequired.');
    const extract = (kind: string) => parseProgressScopeWithAnchors({ outputLocale: 'en-US', lines: [{ id: 'L1', kind }, { id: 'L2', kind: 'required' }] }, source, 'en-US', PROGRESS_BATCH_PROFILE);
    expect(extract('context').scope.requirements[0]).toMatchObject({ id: 'R2', sources: [{ id: 'L2', quote: 'Required.' }] });
    expect(extract('required').scope.requirements[1].id).toBe('R2');
});
it('CommitScope916-C04/C05 retains uncertain obligations and independent exclusions', () => {
    const source = captureProgressScopeSource('Required.\nAmbiguous.\nExcluded.');
    const { scope } = parseProgressScopeWithAnchors({ outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }, { id: 'L2', kind: 'uncertain' }, { id: 'L3', kind: 'excluded' }] }, source, 'en-US', PROGRESS_BATCH_PROFILE);
    expect(scope.requirements[1]).toMatchObject({ id: 'R2', uncertain: true, sources: [{ id: 'L2', quote: 'Ambiguous.' }] });
    expect(scope.exclusions[0]).toMatchObject({ id: 'X3', sources: [{ id: 'L3', quote: 'Excluded.' }] });
});
it('CommitScope916-C07 reduces reordered receipt delivery in frozen manifest order', () => {
    const f = fixture(), receipts = f.batches.map((_, index) => f.receipt(index));
    expect(aggregateProgressAssessmentReceipts(f.manifest, f.batches, [...receipts].reverse())).toEqual(aggregateProgressAssessmentReceipts(f.manifest, f.batches, receipts));
});
it('CommitScope916-C08 treats compatible duplicate and reordered outcome delivery idempotently', () => {
    const f = fixture(), output = f.output();
    output.requirements.reverse();
    expect(f.receipt(0, output)).toEqual(f.receipt());
    const receipts = f.batches.map((_, index) => f.receipt(index));
    expect(aggregateProgressAssessmentReceipts(f.manifest, f.batches, [...receipts, f.receipt()])).toEqual(aggregateProgressAssessmentReceipts(f.manifest, f.batches, receipts));
});
it('CommitScope916-C14 rejects conflicting duplicate deliveries', () => {
    const f = fixture(), output = f.output();
    output.requirements[0].summary = 'Different observation.';
    expect(() => aggregateProgressAssessmentReceipts(f.manifest, f.batches, [f.receipt(), f.receipt(1), f.receipt(0, output)])).toThrow(expect.objectContaining({ recovery: expect.objectContaining({ variables: expect.objectContaining({ reason: 'receipt-conflict' }) }) }));
});
it('CommitScope916-C12 reports exact verified batch coverage for a missing receipt', () => {
    const f = fixture();
    expect(() => aggregateProgressAssessmentReceipts(f.manifest, f.batches, [f.receipt()])).toThrow(expect.objectContaining({ recovery: { id: 'progress-batch-retained', variables: { reason: 'receipt-coverage', verified: 1, expected: 2, batch: 0, requirementId: 'none' } } }));
});
it.each(['repository', 'issueNumber', 'issueDescription', 'headSha', 'baseSha'] as const)('CommitScope916-C13 binds receipts to immutable %s', field => {
    const f = fixture();
    const input = { ...f.input, [field]: field === 'issueNumber' ? 917 : field === 'headSha' || field === 'baseSha' ? 'f'.repeat(40) : field === 'repository' ? 'other/repo' : 'Different snapshot.' };
    if (field === 'headSha' || field === 'baseSha') expect(() => createProgressScopeManifest(input, f.diff)).toThrow();
    else {
        const manifest = createProgressScopeManifest(input, f.diff);
        expect(() => aggregateProgressAssessmentReceipts(manifest, planProgressAssessmentBatches(manifest), [f.receipt(), f.receipt(1)])).toThrow();
    }
});
it('CommitScope916-C10 enforces aggregate requirement and assignment boundaries', () => {
    expect(fixture(256).batches).toHaveLength(8);
    expect(() => fixture(257)).toThrow(expect.objectContaining({ recovery: expect.objectContaining({ variables: expect.objectContaining({ reason: 'scope-capacity' }) }) }));
    for (const size of [0, -1, 33, 1.5]) expect(() => progressGroups([1], size)).toThrow();
});
it('CommitScope916-C10 accounts for every query including retries and refuses call 121 before dispatch', async () => {
    const query = jest.fn(async () => ({})), budget = boundProgressBatchAgent({ query }, () => 0);
    const request = { configuration: undefined, agentId: 'fixture', prompt: 'Data' };
    for (let index = 0; index < 120; index++) await budget.agent.query(request);
    await expect(budget.agent.query(request)).rejects.toMatchObject({ recovery: expect.objectContaining({ variables: expect.objectContaining({ reason: 'call-budget' }) }) });
    expect(query).toHaveBeenCalledTimes(120); expect(budget.calls()).toBe(120);
});
it('CommitScope916-C10 checks elapsed time after an in-flight query and before publication', async () => {
    let now = 0;
    const budget = boundProgressBatchAgent({ query: async () => { now = PROGRESS_BATCH_PROFILE.milliseconds + 1; return {}; } }, () => now);
    await expect(budget.agent.query({ configuration: undefined, agentId: 'fixture', prompt: 'Data' })).rejects.toMatchObject({ recovery: expect.objectContaining({ variables: expect.objectContaining({ reason: 'time-budget' }) }) });
    expect(() => budget.verify()).toThrow();
});
it('CommitScope916-C11 rejects generated metadata as support for implementation', () => {
    const f = fixture(1);
    const diff = partitionProgressDiff(base, head, [{ path: 'build/index.js', status: 'modified', additions: 1, deletions: 0, evidence: 'generated-metadata-only' },
        { path: 'src/product.ts', status: 'modified', additions: 1, deletions: 0, patch: '+source' }]);
    const manifest = createProgressScopeManifest(f.input, diff), [batch] = planProgressAssessmentBatches(manifest);
    expect(manifest.evidence).toHaveLength(2);
    expect(progressBatchResponseSchema(manifest, batch, f.extraction.anchors, false).properties.requirements.items.properties.citations.items.enum).toEqual(['src/product.ts']);
    const response = { ...f.output(), progress: 100, manifestDigest: manifest.digest, batchId: batch.id, requirements: [{ ...f.output().requirements[0], status: 'supported', evidence: 'source-only', remaining: null, citations: [manifest.evidence[0].id] }] };
    expect(() => parseProgressAssessmentReceipt(response, manifest, batch, f.extraction.anchors, 'en-US', false)).toThrow();
    response.requirements[0].citations = ['src/product.ts'];
    expect(parseProgressAssessmentReceipt(response, manifest, batch, f.extraction.anchors, 'en-US', false).result.progress).toBe(100);
});
it('CommitScope916-C11 rejects an exclusively generated comparison before constructing a native assessment schema', () => {
    const f = fixture(1);
    const diff = partitionProgressDiff(base, head, [{ path: 'build/index.js', status: 'modified', additions: 1, deletions: 0, evidence: 'generated-metadata-only' }]);
    expect(() => createProgressScopeManifest(f.input, diff)).toThrow(expect.objectContaining({ recovery: expect.objectContaining({ variables: expect.objectContaining({ reason: 'evidence-missing' }) }) }));
});
it('CommitScope916-C11 freezes source authority and accepted evidence before further async calls', () => {
    const f = fixture();
    expect(Object.isFrozen(f.manifest.scope.requirements[0].sources)).toBe(true);
    const receipt = f.receipt();
    expect(Object.isFrozen(receipt.result)).toBe(true); expect(Object.isFrozen(receipt.citations[0])).toBe(true);
});
it.each(['en-US', 'es-ES'])('CommitScope916-C20 presents safe retained coverage in %s', locale => {
    const error = progressBatchRejected('evidence-missing', { verified: 2, expected: 3, batch: 3, requirementId: 'R17' });
    const presentation = buildApplicationErrorPresentation(error, resolveStaticApplicationErrorCatalog(locale).message);
    expect(JSON.stringify(presentation)).toContain('R17'); expect(JSON.stringify(presentation)).toContain('2');
    expect(isProgressBatchDiagnostic(error.recovery!.variables)).toBe(true);
    expect(isProgressBatchDiagnostic({ ...error.recovery!.variables, requirementId: '@everyone /copilot deploy' })).toBe(false);
});
it('CommitScope916-C09 supplies strict native same-head and citation response schemas', () => {
    const f = fixture(), schema = progressBatchResponseSchema(f.manifest, f.batches[0], f.extraction.anchors, true);
    expect(schema.properties.headSha.enum).toEqual([head]);
    expect(schema.properties.requirements.items.properties.citations.minItems).toBe(1);
    expect(schema.properties.requirements.maxItems).toBe(32);
    const native = projectCodexOutputSchema(schema) as typeof schema;
    expect(Object.keys(native.properties.requirements.items.properties.citations).sort()).toEqual(['items', 'maxItems', 'minItems', 'type']);
    expect(native.properties.requirements.items.properties.citations).toEqual(schema.properties.requirements.items.properties.citations);
});

it('CommitScope916-C03 preserves a mandatory draft-only obligation and its original case reference', () => {
    const publication = { issueUrl: 'https://github.com/owner/repo/issues/916', cardId: 1, path: 'specs/fixture.md', commitSha: base, artifactHash: 'a'.repeat(64) };
    const requirement = { id: 'L2', quote: 'Preserve draft-only qualification.', origin: 'draft' as const };
    const caseLine = { id: 'L3', quote: 'Run the exact draft-only case.', origin: 'draft' as const };
    const source = { lines: [{ id: 'L1', quote: 'Issue context.', origin: 'issue' as const }, requirement], totalLines: 3, operationalLines: 0,
        draft: { publication, required: new Set(['L2']), evidence: new Map([['L2', [caseLine]]]) } };
    const response = { outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'context', sameAs: 'none' }, { id: 'L2', kind: 'required', sameAs: 'none' }] };
    const { scope } = parseProgressScopeWithAnchors(response, source, 'en-US', PROGRESS_BATCH_PROFILE);
    expect(scope.requirements[0]).toMatchObject({ id: 'R2', sources: [requirement, caseLine] });
    expect(scope.publication).toEqual(publication);
    expect(() => parseProgressScopeWithAnchors({ ...response, lines: [response.lines[0], { ...response.lines[1], kind: 'context' }] }, source, 'en-US', PROGRESS_BATCH_PROFILE)).toThrow();
    expect(() => parseProgressScopeWithAnchors({ ...response, lines: [response.lines[0], { ...response.lines[1], sameAs: 'L2' }] }, source, 'en-US', PROGRESS_BATCH_PROFILE))
        .toThrow(expect.objectContaining({ recovery: expect.objectContaining({ variables: expect.objectContaining({ reason: 'scope-classification-invalid', sourceLineId: 'L2' }) }) }));
});
it('CommitScope916-C10 allocates both publication fields across all batches before requests', () => {
    const f = fixture(128);
    const receipts = f.batches.map((batch, index) => {
        const response = f.output(index), schema = progressBatchResponseSchema(f.manifest, batch, f.extraction.anchors, true);
        const limit = schema.properties.requirements.items.properties.summary.maxLength;
        response.requirements.forEach(fact => { fact.summary = '😀'.repeat(limit); fact.remaining = 'r'.repeat(limit); });
        return f.receipt(index, response);
    });
    const aggregate = aggregateProgressAssessmentReceipts(f.manifest, f.batches, receipts);
    expect([...aggregate.summary].length).toBeLessThanOrEqual(8000);
    expect([...aggregate.remaining].length).toBeLessThanOrEqual(8000);
});
it.each(['null', 'json', 'identity', 'path', 'duplicate', 'empty'])('CommitScope916-C11 rejects %s native evidence before it can admit citations', mode => {
    const f = fixture(1);
    let evidence = JSON.parse(f.diff.evidence);
    if (mode === 'null') evidence = null;
    if (mode === 'identity') evidence.headSha = 'f'.repeat(40);
    if (mode === 'path') evidence.changes[0].path = '../outside';
    if (mode === 'duplicate') evidence.changes.push(evidence.changes[0]);
    if (mode === 'empty') evidence.changes = [];
    expect(() => createProgressScopeManifest(f.input, { ...f.diff, evidence: mode === 'json' ? 'invalid json' : JSON.stringify(evidence) })).toThrow();
});
it.each(['repository', 'issue', 'sha'])('CommitScope916-C13 rejects a malformed host %s identity', mode => {
    const f = fixture(1), input = { ...f.input };
    if (mode === 'repository') input.repository = 'invalid';
    if (mode === 'issue') input.issueNumber = 0;
    if (mode === 'sha') input.headSha = 'invalid';
    expect(() => createProgressScopeManifest(input, f.diff)).toThrow();
});
it.each(['envelope', 'entry', 'empty-citations', 'duplicate-citations', 'foreign-citations', 'oversized-fact'])('CommitScope916-C09/C11 rejects %s from an alternate agent port', mode => {
    const f = fixture(), response: any = f.output();
    if (mode === 'envelope') response.extra = true;
    if (mode === 'entry') response.requirements[0] = null;
    if (mode === 'empty-citations') response.requirements[0].citations = [];
    if (mode === 'duplicate-citations') response.requirements[0].citations.push(response.requirements[0].citations[0]);
    if (mode === 'foreign-citations') response.requirements[0].citations = ['foreign'];
    if (mode === 'oversized-fact') response.requirements[0].summary = 's'.repeat(800);
    expect(() => f.receipt(0, response)).toThrow();
});
it.each(['missing-ids', 'assignment-order', 'missing-citations', 'empty-citations', 'foreign-citations', 'digest'])('CommitScope916-C12/C13 rejects %s again at complete reduction', mode => {
    const f = fixture(), original = f.receipt(), { digest: _digest, ...body } = structuredClone(original);
    if (mode === 'missing-ids') body.requirementIds = body.requirementIds.slice(1);
    if (mode === 'assignment-order') body.requirementIds = [...body.requirementIds].reverse();
    if (mode === 'missing-citations') body.citations = [];
    if (mode === 'empty-citations') body.citations = [[], ...body.citations.slice(1)];
    if (mode === 'foreign-citations') body.citations = [['foreign'], ...body.citations.slice(1)];
    const altered = { ...body, digest: mode === 'digest' ? 'invalid' : createHash('sha256').update(JSON.stringify(body)).digest('hex') };
    expect(() => aggregateProgressAssessmentReceipts(f.manifest, f.batches, [altered, f.receipt(1)])).toThrow();
});
it('CommitScope916-C13 rejects an altered manifest at assignment and publication boundaries', () => {
    const f = fixture(), manifest = { ...f.manifest, repository: 'other/repo' };
    expect(() => planProgressAssessmentBatches(manifest)).toThrow();
    expect(() => aggregateProgressAssessmentReceipts(manifest, f.batches, [f.receipt(), f.receipt(1)])).toThrow();
});
it('CommitScope916-C10 preserves an in-budget provider error and identifies an exhausted deadline on failure', async () => {
    const error = new Error('Provider unavailable.'); let now = 0;
    const budget = boundProgressBatchAgent({ query: async () => { throw error; } }, () => now);
    const request = { configuration: undefined, agentId: 'fixture', prompt: 'Data', signal: new AbortController().signal };
    await expect(budget.agent.query(request)).rejects.toBe(error);
    now = PROGRESS_BATCH_PROFILE.milliseconds + 1;
    await expect(budget.agent.query(request)).rejects.toMatchObject({ recovery: expect.objectContaining({ variables: expect.objectContaining({ reason: 'time-budget' }) }) });
});
it.each([undefined, null, [], {}, { reason: 'foreign' }, { verified: 2, expected: 1, batch: 0, reason: 'receipt-coverage', requirementId: 'R1' },
    { verified: 0, expected: 1, batch: -1, reason: 'receipt-coverage', requirementId: 'R1' }])('CommitScope916-C20 rejects malformed diagnostic facts %#', value => {
    expect(isProgressBatchDiagnostic(value)).toBe(false);
});
it('CommitScope916-C01/C02 binds classification receipts and their complete source inventory to the final manifest', () => {
    const f = fixture(), snapshot = progressScopeSnapshotDigest({ repository: f.input.repository, issueNumber: f.input.issueNumber,
        issueDescription: f.input.issueDescription, comparisonSource: f.input.comparisonSource, baseSha: base, headSha: head }, f.source);
    expect(f.manifest.sourceInventory.snapshotDigest).toBe(snapshot);
    expect(f.manifest.sourceInventory.classifications).toHaveLength(33);
    const source = { ...f.source, lines: f.source.lines.slice(0, 32) }, binding = progressClassificationBinding(snapshot, source.lines, head, 1);
    const schema = progressClassificationResponseSchema(source, binding);
    expect(schema.properties.snapshotDigest.enum).toEqual([snapshot]);
    const output = { outputLocale: 'en-US', snapshotDigest: snapshot, assignmentId: binding.assignmentId, headSha: head,
        lines: source.lines.map(line => ({ id: line.id, kind: 'required' })) };
    expect(parseProgressClassificationReceipt(output, source, 'en-US', binding)).toHaveLength(32);
    expect(() => parseProgressClassificationReceipt({ ...output, snapshotDigest: 'foreign' }, source, 'en-US', binding)).toThrow();
    expect(() => parseProgressClassificationReceipt({ ...output, assignmentId: 'foreign' }, source, 'en-US', binding)).toThrow();
});
it('refuses to reduce an empty requirement inventory into completion', () => {
    const f = fixture(1), manifest = createProgressScopeManifest({ ...f.input, scope: { requirements: [], exclusions: [] } }, f.diff);
    expect(() => planProgressAssessmentBatches(manifest)).toThrow();
    expect(() => aggregateProgressAssessmentReceipts(manifest, [], [])).toThrow();
});
it('reserves source identity and complete classification overhead inside the manifest byte budget', () => {
    const f = fixture(200), padding = Math.floor((PROGRESS_BATCH_PROFILE.bytes - 1000 - Buffer.byteLength(JSON.stringify(f.input.scope))) / 400);
    const lines = f.source.lines.map(line => ({ ...line, quote: line.quote + 'q'.repeat(padding) }));
    const scope = { ...f.input.scope, requirements: f.input.scope.requirements.map((requirement, index) => ({ ...requirement, quote: lines[index].quote, sources: [lines[index]] })) };
    expect(Buffer.byteLength(JSON.stringify(scope))).toBeLessThan(PROGRESS_BATCH_PROFILE.bytes);
    expect(() => createProgressScopeManifest({ ...f.input, issueDescription: lines.map(line => line.quote).join('\n'), capturedSource: { ...f.source, lines }, scope }, f.diff)).toThrow();
});
it('reserves the complete compact citation layout before admitting any assessment schema', () => {
    const f = fixture(256), scope = { ...f.input.scope, requirements: f.input.scope.requirements.map(requirement => ({ ...requirement, sources: [...requirement.sources!, ...f.source.lines.slice(0, 9)] })) };
    const manifest = createProgressScopeManifest({ ...f.input, scope }, f.diff), batches = planProgressAssessmentBatches(manifest);
    expect(() => progressBatchResponseSchema(manifest, batches[0], f.extraction.anchors, true)).toThrow();
});
it('rechecks the aggregate field budget independently of receipt digests', () => {
    const f = fixture(), { digest: _digest, ...body } = structuredClone(f.receipt());
    body.result.summary = 's'.repeat(8001);
    const altered = { ...body, digest: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
    expect(() => aggregateProgressAssessmentReceipts(f.manifest, f.batches, [altered, f.receipt(1)])).toThrow();
});
