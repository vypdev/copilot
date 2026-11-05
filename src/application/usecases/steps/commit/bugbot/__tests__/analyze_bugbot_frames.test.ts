import { DEFAULT_BUGBOT_REVIEW_CONFIGURATION } from '../../../../../../domain/bugbot/review_configuration';
import { framedSource, framedFiles, framedChange, FRAME_NONCE } from '../../../../../policies/__tests__/fixtures/bugbot_framed_fixture';
import { buildBugbotFramedReviewPlan, type BugbotFramedReviewPlan } from '../../../../../policies/bugbot_framed_review_policy';
import { BugbotReviewCompletenessError, type BugbotFramedReviewSource } from '../../../../../../domain/bugbot/framed_review';
import type { FindingsQueryRequest } from '../../../../../ports/agent_findings_ports';
import type { BugbotReviewOperationContext } from '../bugbot_review_operation_context';
import type { BugbotContext } from '../types';
import { BugbotReviewTelemetry } from '../bugbot_review_telemetry';
import { analyzeBugbotFrames, bugbotFramedContextDigest } from '../analyze_bugbot_frames';
import { analyzeBugbotRevision } from '../analyze_bugbot_revision_use_case';

function setup(source: BugbotFramedReviewSource = framedSource()) {
    const id = source.identity;
    const operation: BugbotReviewOperationContext = {
        repository: { owner: id.owner, name: id.repository },
        target: { issueNumber: 7, isPullRequest: true, pullRequestNumber: id.pullRequestNumber,
            headBranch: id.headRef, commitBranch: id.headRef, baseBranch: id.baseRef, pullRequestAction: 'opened', draft: false },
        trigger: { kind: 'pull_request', headOwner: id.headOwner }, locale: { issue: 'en-US', pullRequest: 'en-US' },
        ignorePatterns: [], organizationRules: [], analysis: { agentConfiguration: { provider: 'codex', model: 'reviewer' },
            minimumSeverity: 'low', commentLimit: 20, reviewConfiguration: DEFAULT_BUGBOT_REVIEW_CONFIGURATION },
    };
    const context: BugbotContext = {
        existingByFindingId: {}, issueComments: [], selectionReason: 'event', eligibleResolutionIds: new Set(),
        previousFindingsBlock: '', unresolvedFindingsWithBody: [], coverage: { status: 'complete', sources: [] },
        canonicalPullRequest: { number: id.pullRequestNumber, state: 'open', draft: false,
            baseRepository: { owner: id.owner, name: id.repository, id: id.repositoryId },
            baseRef: id.baseRef, baseSha: id.baseSha, baseRefSha: id.baseSha, headRepositoryName: id.headRepository, headRepositoryOwner: id.headOwner,
            headRef: id.headRef, headSha: id.headSha, changedFileCount: source.changes.length },
        prContext: { prHeadSha: id.headSha, prFiles: source.changes.map(x => ({ filename: x.filename, status: x.status })),
            changes: source.changes.map(x => ({ ...x })), pathToFirstDiffLine: {} },
        reviewFramedSource: source,
    };
    const plan = buildBugbotFramedReviewPlan(source, bugbotFramedContextDigest(operation, context), FRAME_NONCE, []);
    context.reviewFramedPlan = plan; context.reviewDiffPartitions = plan.partitions;
    return { source, operation, context, plan, telemetry: new BugbotReviewTelemetry(operation) };
}
function reply(request: FindingsQueryRequest, extra: Record<string, unknown> = {}): Record<string, unknown> {
    const properties = (request.options!.schema as any).properties;
    return {
        outputLocale: 'en-US', partition_id: properties.partition_id.enum[0], reviewed_head_sha: properties.reviewed_head_sha.enum[0],
        reviewed_base_sha: properties.reviewed_base_sha.enum[0], review_manifest_digest: properties.review_manifest_digest.enum[0],
        review_frame_id: properties.review_frame_id.enum[0], review_coverage_digest: properties.review_coverage_digest.enum[0],
        reviewed_fragment_ids: properties.reviewed_fragment_ids.items.enum,
        findings: [], resolved_findings: [], ...extra,
    };
}
function run(fixture: ReturnType<typeof setup>, query: (request: FindingsQueryRequest) => Promise<Record<string, unknown>> = jest.fn(async (request: FindingsQueryRequest) => reply(request)),
    isSourceCurrent = jest.fn(async () => true), plan: BugbotFramedReviewPlan = fixture.plan) {
    return analyzeBugbotFrames(fixture.operation, fixture.context, plan,
        { agent: { query }, telemetry: fixture.telemetry, isSourceCurrent });
}

it('validates every source-bound receipt before returning one global result', async () => {
    const f = setup(); const query = jest.fn(async (request: FindingsQueryRequest) => reply(request));
    await expect(run(f, query)).resolves.toEqual({ findings: [], resolved_findings: [] });
    expect(query).toHaveBeenCalledTimes(1);
});

it('bugbot-framed-C079 completes the first frame before starting the next, with global concurrency2', async () => {
    const f = setup(framedFiles(65));
    let active = 0, maximum = 0, completedFirst = 0;
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        const result = reply(request);
        const first = result.review_frame_id === f.plan.frames[0].id;
        if (!first) expect(completedFirst).toBe(64);
        active++; maximum = Math.max(maximum, active);
        await Promise.resolve();
        active--; if (first) completedFirst++;
        return result;
    });
    await run(f, query);
    expect(query).toHaveBeenCalledTimes(65); expect(maximum).toBe(2);
});

it.each(['partition_id', 'reviewed_head_sha', 'reviewed_base_sha', 'review_manifest_digest',
    'review_frame_id', 'review_coverage_digest'] as const)('rejects substituted %s even after3 identical retries', async field => {
    const f = setup(); const query = jest.fn(async (request: FindingsQueryRequest) => reply(request, { [field]: 'foreign' }));
    await expect(run(f, query)).rejects.toMatchObject({ facts: { resource: 'receipt' } });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][0].prompt).toBe(query.mock.calls[2][0].prompt);
    expect(query.mock.calls[0][0].options!.schema).toEqual(query.mock.calls[2][0].options!.schema);
});

it.each([[], ['duplicate'], null])('rejects incomplete or foreign fragment receipts %j', async reviewed_fragment_ids => {
    const f = setup(); const query = jest.fn(async (request: FindingsQueryRequest) => reply(request, { reviewed_fragment_ids }));
    await expect(run(f, query)).rejects.toBeInstanceOf(BugbotReviewCompletenessError);
    expect(query).toHaveBeenCalledTimes(3);
});

it('bugbot-framed-C095 retries only the identical failed partition after a transient interruption', async () => {
    const f = setup();
    const query = jest.fn(async (request: FindingsQueryRequest) => reply(request));
    query.mockRejectedValueOnce(new Error('temporary provider interruption'));
    await run(f, query);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toEqual(query.mock.calls[1][0]);
});

it('bugbot-framed-C097 exhausts three provider attempts without returning a partial result', async () => {
    const f = setup(); const query = jest.fn(async (_request: FindingsQueryRequest) => { throw new Error('temporary'); });
    await expect(run(f, query)).rejects.toThrow('temporary');
    expect(query).toHaveBeenCalledTimes(3);
});

it('blocks stale source before the first model call', async () => {
    const f = setup(); const query = jest.fn(async (request: FindingsQueryRequest) => reply(request));
    await expect(run(f, query, jest.fn(async () => false))).rejects.toMatchObject({ facts: { resource: 'identity' } });
    expect(query).not.toHaveBeenCalled();
});

it('bugbot-framed-C105 rechecks identity between frames without starting the stale second frame', async () => {
    const f = setup(framedFiles(65)); const query = jest.fn(async (request: FindingsQueryRequest) => reply(request));
    const current = jest.fn(async () => true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(run(f, query, current)).rejects.toMatchObject({ facts: { resource: 'identity' } });
    expect(query).toHaveBeenCalledTimes(64);
});

it('blocks source changes at the final fence even if every response was otherwise valid', async () => {
    const f = setup(); const query = jest.fn(async (request: FindingsQueryRequest) => reply(request));
    const current = jest.fn(async () => true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(run(f, query, current)).rejects.toMatchObject({ facts: { resource: 'identity' } });
    expect(query).toHaveBeenCalledTimes(1);
});

it('invalidates changed review context after completed internal work', async () => {
    const f = setup(); const query = jest.fn(async (request: FindingsQueryRequest) => {
        f.context.reviewRulesBlock = 'new rule'; return reply(request);
    });
    await expect(run(f, query)).rejects.toMatchObject({ facts: { resource: 'identity' } });
});

it('preflights complete prompts before starting even one reviewer query', async () => {
    const f = setup(); f.context.reviewRulesBlock = 'x'.repeat(524289);
    const plan = buildBugbotFramedReviewPlan(f.source, bugbotFramedContextDigest(f.operation, f.context), FRAME_NONCE, []);
    const query = jest.fn(async (request: FindingsQueryRequest) => reply(request));
    await expect(run(f, query, undefined, plan)).rejects.toMatchObject({ facts: { resource: 'promptBytes', limit: 524288 } });
    expect(query).not.toHaveBeenCalled();
});

it('does not query a mutated plan even if its claimed counts are unchanged', async () => {
    const f = setup(); const plan = JSON.parse(JSON.stringify(f.plan)); plan.partitions[0].block += 'foreign';
    const query = jest.fn(async (request: FindingsQueryRequest) => reply(request));
    await expect(run(f, query, undefined, plan)).rejects.toMatchObject({ facts: { resource: 'manifest' } });
    expect(query).not.toHaveBeenCalled();
});

it.each([
    ['findings', null], ['resolved_findings', null], ['findings', Array.from({ length: 201 }, () => ({}))],
    ['resolved_findings', Array.from({ length: 501 }, () => ({}))],
] as const)('rejects missing or over-cap %s payload', async (field, value) => {
    const f = setup(); const query = jest.fn(async (request: FindingsQueryRequest) => reply(request, { [field]: value }));
    await expect(run(f, query)).rejects.toBeInstanceOf(BugbotReviewCompletenessError);
});

it('accepts the exact per-response finding bound independently of global normalization', async () => {
    const f = setup(); const findings = Array.from({ length: 200 }, (_, id) => ({ id }));
    const query = jest.fn(async (request: FindingsQueryRequest) => reply(request, { findings }));
    expect((await run(f, query)).findings).toHaveLength(200);
});

it('refuses a non-owner resolution even for an existing retained finding id', async () => {
    const f = setup(framedFiles(2));
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        const response = reply(request);
        return response.partition_id === f.plan.partitions[1].id ? { ...response, resolved_findings: [{ id: 'real', resolution: 'fixed' }] } : response;
    });
    await expect(run(f, query)).rejects.toMatchObject({ facts: { resource: 'receipt' } });
});

it('prevents replay of a prior-invocation result under otherwise identical source', async () => {
    const f = setup(); let old: Record<string, unknown> | undefined;
    const first = jest.fn(async (request: FindingsQueryRequest) => old = reply(request));
    await run(f, first);
    const next = buildBugbotFramedReviewPlan(f.source, bugbotFramedContextDigest(f.operation, f.context), 'f'.repeat(32), []);
    const replay = jest.fn(async (_request: FindingsQueryRequest) => old!);
    await expect(run(f, replay, undefined, next)).rejects.toMatchObject({ facts: { resource: 'receipt' } });
});

it('includes a late-frame defect in the existing global normalization', async () => {
    const f = setup(framedFiles(65));
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        const r = reply(request);
        const last = (request.options!.schema as any).properties.reviewed_fragment_ids.items.enum.some((id: string) => id.includes('fragment-260-'));
        return { ...r, findings: last ? [{ id: 'late', title: 'Late defect', description: 'Concrete changed-code defect',
            file: 'src/file-64.ts', line: 1, severity: 'high', confidence: 0.99 }] : [] };
    });
    const result = await analyzeBugbotRevision(f.operation, f.context, { agent: { query }, telemetry: f.telemetry, isSourceCurrent: async () => true });
    expect(result?.activeFindings?.map(x => x.title)).toContain('Late defect');
    expect(query).toHaveBeenCalledTimes(65);
});

it.each([2000, 2001])('enforces the global %s-finding boundary across complete partition receipts', async count => {
    const f = setup(framedFiles(11)); let emitted = 0;
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        const size = Math.min(200, count - emitted); emitted += size;
        return reply(request, { findings: Array.from({ length: size }, (_, index) => ({ id: `${emitted}-${index}` })) });
    });
    if (count === 2000) expect((await run(f, query)).findings).toHaveLength(2000);
    else await expect(run(f, query)).rejects.toMatchObject({ facts: { resource: 'findings', observed: 2001, limit: 2000 } });
});

it.each([false, true])('measures per-response UTF-8 byte boundary before accepting output; overflow=%s', async overflow => {
    const f = setup();
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        const r = reply(request, { padding: '' });
        const bytes = Buffer.byteLength(JSON.stringify(r));
        return { ...r, padding: 'x'.repeat(4 * 1024 * 1024 - bytes + Number(overflow)) };
    });
    if (!overflow) await expect(run(f, query)).resolves.toBeDefined();
    else await expect(run(f, query)).rejects.toMatchObject({ facts: { resource: 'responseBytes', observed: 4194305 } });
    expect(query).toHaveBeenCalledTimes(1);
});

it.each([false, true])('measures aggregate retained result bytes independently; overflow=%s', async overflow => {
    const f = setup(framedFiles(5)); let index = 0;
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        const r = reply(request, { padding: '' }); const bytes = Buffer.byteLength(JSON.stringify(r));
        const target = index++ < 4 ? 4 * 1024 * 1024 - 1024 : 4096 + Number(overflow);
        return { ...r, padding: 'x'.repeat(target - bytes) };
    });
    if (!overflow) await expect(run(f, query)).resolves.toBeDefined();
    else await expect(run(f, query)).rejects.toMatchObject({ facts: { resource: 'resultBytes', observed: 16777217 } });
});

it('preflights aggregate prompt bytes even when every individual assignment fits', async () => {
    const f = setup(framedFiles(128)); f.context.reviewRulesBlock = 'x'.repeat(260000);
    const plan = buildBugbotFramedReviewPlan(f.source, bugbotFramedContextDigest(f.operation, f.context), FRAME_NONCE, []);
    const query = jest.fn(async (request: FindingsQueryRequest) => reply(request));
    await expect(run(f, query, undefined, plan)).rejects.toMatchObject({ facts: { resource: 'promptTotalBytes', limit: 33554432 } });
    expect(query).not.toHaveBeenCalled();
});

it('reports content-free measured framed telemetry after full completion', async () => {
    const f = setup(framedFiles(65)); f.telemetry.observeContext(f.context);
    await run(f);
    const snapshot = f.telemetry.snapshot('no-findings');
    expect(snapshot.framedReview).toMatchObject({ profile: 'framed-v1', frames: 2, completedFrames: 2,
        manifestDigest: f.plan.manifestDigest, rawUtf16: 65 * 48000 });
    expect(snapshot.framedReview!.promptBytes).toBeGreaterThan(65 * 48000);
    expect(snapshot.framedReview!.responseBytes).toBeGreaterThan(0);
    expect(JSON.stringify(snapshot.framedReview)).not.toContain('src/file');
});

it.each(['canonicalPullRequest', 'prContext'])('refuses framed analysis with missing %s', async field => {
    const f = setup(); (f.context as any)[field] = null;
    const query = jest.fn(async (r: FindingsQueryRequest) => reply(r));
    await expect(analyzeBugbotRevision(f.operation, f.context, { agent: { query }, telemetry: f.telemetry, isSourceCurrent: async () => true }))
        .rejects.toMatchObject({ facts: { resource: 'identity' } });
    expect(query).not.toHaveBeenCalled();
});
it('requires an independent current-source capability before framed model execution', async () => {
    const f = setup(); const query = jest.fn(async (r: FindingsQueryRequest) => reply(r));
    await expect(analyzeBugbotRevision(f.operation, f.context, { agent: { query }, telemetry: f.telemetry }))
        .rejects.toMatchObject({ facts: { resource: 'capability' } });
    expect(query).not.toHaveBeenCalled();
});
it('binds actual retained prior finding records to the effective review context', () => {
    const f = setup(); f.context.eligibleResolutionIds = new Set(['prior']);
    f.context.existingByFindingId.prior = { issue: { resolved: false, commentId: 10 } };
    const before = bugbotFramedContextDigest(f.operation, f.context);
    f.context.existingByFindingId.prior.issue!.resolved = true;
    expect(bugbotFramedContextDigest(f.operation, f.context)).not.toBe(before);
});
it('does not accept a frame list altered across an awaited freshness read', async () => {
    const f = setup(), plan = JSON.parse(JSON.stringify(f.plan));
    const query = jest.fn(async (r: FindingsQueryRequest) => reply(r));
    await expect(run(f, query, jest.fn(async () => { plan.frames[0].partitionIds = ['foreign']; return true; }), plan))
        .rejects.toMatchObject({ facts: { resource: 'coverage' } });
    expect(query).not.toHaveBeenCalled();
});
it('never interprets an undefined reviewer response as empty findings', async () => {
    const f = setup(); const query = jest.fn(async (_r: FindingsQueryRequest) => undefined as any);
    await expect(run(f, query)).rejects.toBeDefined(); expect(query).toHaveBeenCalledTimes(3);
});

it('requires the live identity read capability at every framed freshness fence', async () => {
    const { hasNewerBugbotRevision } = await import('../bugbot_review_freshness');
    const f = setup();
    await expect(hasNewerBugbotRevision(f.context, {} as any)).rejects.toMatchObject({ facts: { resource: 'capability' } });
});

it.each([false, true])('preflights the exact final native prompt boundary, overflow=%s', async overflow => {
    const { bugbotFramedPromptBytes } = await import('../../../../../policies/bugbot_framed_prompt_policy');
    const { buildBugbotPartitionQueryRequest } = await import('../query_bugbot_findings');
    const { buildBugbotReviewInput } = await import('../build_bugbot_prompt');
    const f = setup(); f.context.reviewRulesBlock = 'x';
    const size = (plan: BugbotFramedReviewPlan) => {
        const p = plan.partitions[0], input = buildBugbotReviewInput(f.operation, f.context, { partition: p });
        return bugbotFramedPromptBytes(buildBugbotPartitionQueryRequest(f.operation.analysis.agentConfiguration, input.prompt,
            { partitionId: p.id, headSha: p.headSha, framed: p.framed }));
    };
    const original = size(f.plan); f.context.reviewRulesBlock += 'x'.repeat(524288 - original + Number(overflow));
    const plan = buildBugbotFramedReviewPlan(f.source, bugbotFramedContextDigest(f.operation, f.context), FRAME_NONCE, []);
    expect(size(plan)).toBe(524288 + Number(overflow));
    const query = jest.fn(async (request: FindingsQueryRequest) => reply(request));
    if (overflow) { await expect(run(f, query, undefined, plan)).rejects.toMatchObject({ facts: { resource: 'promptBytes', observed: 524289 } }); expect(query).not.toHaveBeenCalled(); }
    else { await expect(run(f, query, undefined, plan)).resolves.toBeDefined(); expect(query).toHaveBeenCalledTimes(1); }
});
it('detects final native envelope overflow in a later assignment before the first model query', async () => {
    const { bugbotFramedPromptBytes } = await import('../../../../../policies/bugbot_framed_prompt_policy');
    const { buildBugbotPartitionQueryRequest } = await import('../query_bugbot_findings');
    const { buildBugbotReviewInput } = await import('../build_bugbot_prompt');
    const f = setup(framedSource([framedChange({ filename: 'one.ts', patch: 'x'.repeat(48000) }), framedChange({ filename: Array(5).fill('directory-' + 'x'.repeat(160)).join('/') + '/two.ts', patch: 'x'.repeat(48000) })]));
    f.context.reviewRulesBlock = 'x';
    const bytes = (plan: BugbotFramedReviewPlan) => plan.partitions.map(p => bugbotFramedPromptBytes(buildBugbotPartitionQueryRequest(f.operation.analysis.agentConfiguration,
        buildBugbotReviewInput(f.operation, f.context, { partition: p }).prompt, { partitionId: p.id, headSha: p.headSha, framed: p.framed })));
    const initial = bytes(f.plan); expect(initial).toHaveLength(2); expect(initial[1]).toBeGreaterThan(initial[0] + 100);
    f.context.reviewRulesBlock += 'x'.repeat(524288 - initial[0] - 100);
    const plan = buildBugbotFramedReviewPlan(f.source, bugbotFramedContextDigest(f.operation, f.context), FRAME_NONCE, []);
    expect(bytes(plan)[0]).toBeLessThan(524288); expect(bytes(plan)[1]).toBeGreaterThan(524288);
    const query = jest.fn(async (request: FindingsQueryRequest) => reply(request));
    await expect(run(f, query, undefined, plan)).rejects.toMatchObject({ facts: { resource: 'promptBytes' } });
    expect(query).not.toHaveBeenCalled();
});

it('reconstructs an identical retry request even when a query port mutates its received request object', async () => {
    const f = setup(), observed: string[] = [];
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        observed.push(request.prompt);
        if (observed.length === 1) { request.prompt = 'foreign task'; return reply(request, { partition_id: 'foreign' }); }
        return reply(request);
    });
    await run(f, query);
    expect(query).toHaveBeenCalledTimes(2); expect(observed[0]).toBe(observed[1]);
});


function literalFrameFixture(count = 1) {
    const patch = '@@ -1 +1,2 @@\n-old\n+script = "a\\nb"\n+#' + 'x'.repeat(count > 1 ? 48000 : 0);
    return setup(framedSource(Array.from({ length: count }, (_, index) => framedChange({
        filename: `src/generated-${index}.py`, patch, additions: 2, deletions: 1,
    }))));
}
function literalHypotheses(file: string, count: number) {
    return Array.from({ length: count }, (_, index) => ({ id: `hypothesis-${index}`, file, line: 1,
        title: 'Candidate hypothesis', description: 'Verify the literal against its immutable source.',
        codeSnippet: 'script = "a\\nb"', evidence: 'Unverified hypothesis', severity: 'medium', confidence: 0.9 }));
}
function rejectLiteralHypotheses(request: FindingsQueryRequest) {
    const properties = (request.options!.schema as any).properties;
    return { outputLocale: 'en-US', verification_id: properties.verification_id.enum[0], findings: [],
        rejected_ids: properties.rejected_ids.items.enum };
}

it.each([false, true])('verifies a source-bound Python recovery candidate without generated literals; retain=%s', async retain => {
    const f = setup(framedSource([framedChange({ filename: 'src/recovery.py',
        patch: '@@ -1 +1,2 @@\n-old\n+def fail():\n+    raise', additions: 2, deletions: 1 })]));
    expect(f.plan.partitions[0].hasPythonLiteralWitnesses).toBeUndefined();
    const candidate = { id: 'recovery', file: 'src/recovery.py', line: 2, codeSnippet: 'raise',
        title: 'Recovery contract violation', description: 'Check a retained-output requirement.',
        evidence: 'Selected contract and source prove this candidate.', severity: 'medium', confidence: .9 };
    const query = jest.fn(async (request: FindingsQueryRequest) => request.agentId === 'bugbot-literal-candidate-verification'
        ? { ...rejectLiteralHypotheses(request), findings: retain ? [candidate] : [], rejected_ids: retain ? [] : ['recovery'] }
        : reply(request, { findings: [candidate] }));
    const result = await run(f, query);
    expect(result.findings).toHaveLength(Number(retain));
    if (retain) expect(result.findings?.[0]).toMatchObject({ id: 'recovery', file: 'src/recovery.py', line: 2 });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0].prompt).toContain('Ownership does NOT imply disposability');
});

it('admits a response-dependent generated verification request through the actual framed query port', async () => {
    const f = literalFrameFixture();
    expect(f.plan.partitions[0].hasPythonLiteralWitnesses).toBe(true);
    const query = jest.fn(async (request: FindingsQueryRequest) => request.agentId === 'bugbot-literal-candidate-verification'
        ? rejectLiteralHypotheses(request)
        : reply(request, { findings: literalHypotheses(f.plan.partitions[0].files[0], 1) }));
    await expect(run(f, query)).resolves.toEqual({ findings: [], resolved_findings: [] });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0].agentId).toBe('bugbot-literal-candidate-verification');
});

it.each([false, true])('bounds dependent verification and actual retries with one traffic ledger; retry=%s', async retry => {
    const { bugbotFramedPromptBytes } = await import('../../../../../policies/bugbot_framed_prompt_policy');
    const { buildBugbotPartitionQueryRequest } = await import('../query_bugbot_findings');
    const { buildBugbotReviewInput } = await import('../build_bugbot_prompt');
    const f = literalFrameFixture(128), limit = 32 * 1024 * 1024;
    f.telemetry.observeContext(f.context);
    expect(f.plan.partitions).toHaveLength(128);
    // Fragment packing can leave a final assignment with only the tail of a Python file.
    expect(f.plan.partitions.filter(p => p.hasPythonLiteralWitnesses).length).toBeGreaterThan(64);
    const primaryBytes = f.plan.partitions.reduce((total, p) => total + bugbotFramedPromptBytes(buildBugbotPartitionQueryRequest(
        f.operation.analysis.agentConfiguration, buildBugbotReviewInput(f.operation, f.context, { partition: p }).prompt,
        { partitionId: p.id, headSha: p.headSha, framed: p.framed })), 0);
    expect(primaryBytes).toBeLessThan(limit);
    let delegatedBytes = 0, auxiliaryCalls = 0, failedOnce = false;
    const primaryAttempts = new Map<string, number>();
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        delegatedBytes += bugbotFramedPromptBytes(request);
        expect(delegatedBytes).toBeLessThanOrEqual(limit);
        if (request.agentId === 'bugbot-literal-candidate-verification') {
            auxiliaryCalls++; return rejectLiteralHypotheses(request);
        }
        const result = reply(request), id = result.partition_id as string;
        primaryAttempts.set(id, (primaryAttempts.get(id) ?? 0) + 1);
        if (retry && !failedOnce) { failedOnce = true; throw new Error('one transient primary failure'); }
        const partition = f.plan.partitions.find(p => p.id === id)!;
        return { ...result, findings: literalHypotheses(partition.files[0], partition.hasPythonLiteralWitnesses ? 200 : 0) };
    });
    await expect(run(f, query)).rejects.toMatchObject({ facts: { resource: 'promptTotalBytes', limit } });
    expect(auxiliaryCalls).toBeGreaterThan(10);
    expect(primaryAttempts.size).toBeLessThan(f.plan.partitions.length);
    expect([...primaryAttempts.values()].filter(attempts => attempts === 2)).toHaveLength(Number(retry));
    expect([...primaryAttempts.values()].every(attempts => attempts <= 2)).toBe(true);
    expect(f.telemetry.snapshot('failed').framedReview!.completedFrames).toBeLessThan(f.plan.frames.length);
});

it('binds every complete-conversation page into the manifest and rejects a changed clarification after analysis', async () => {
    const f = setup(); f.context.reviewConversationBlock = 'Long untrusted clarification\n'.repeat(2000);
    const plan = buildBugbotFramedReviewPlan(f.source, bugbotFramedContextDigest(f.operation, f.context), FRAME_NONCE, []);
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        f.context.reviewConversationBlock += '\nEdited clarification'; return reply(request);
    });
    await expect(run(f, query, undefined, plan)).rejects.toMatchObject({ facts: { resource: 'identity' } });
    expect(query).toHaveBeenCalledTimes(1);
});
it('preflights cumulative native traffic for complete discussion repeated across all source partitions', async () => {
    const f = setup(framedFiles(128)); f.context.reviewConversationBlock = 'x'.repeat(360000);
    const plan = buildBugbotFramedReviewPlan(f.source, bugbotFramedContextDigest(f.operation, f.context), FRAME_NONCE, []);
    const query = jest.fn(async (request: FindingsQueryRequest) => reply(request));
    await expect(run(f, query, undefined, plan)).rejects.toMatchObject({ facts: { resource: 'promptTotalBytes', limit: 33554432 } });
    expect(query).not.toHaveBeenCalled();
});
