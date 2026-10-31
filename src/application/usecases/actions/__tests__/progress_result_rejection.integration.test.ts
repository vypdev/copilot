import type { ProgressDiffEvidence } from '../../../ports/progress_diff_query_ports';
import { partitionProgressDiff } from '../../../policies/progress_diff_partition_policy';
import { CheckProgressUseCase } from '../check_progress_use_case';
import { queryProgressResult, type ProgressResponseHostContext } from '../query_progress_result_workflow';
import { FindingsAgentAdapter } from '../../../../data/repository/ai/findings_agent_adapter';
import type { AgentCliPort } from '../../../../infrastructure/agents/ports/agent_provider_ports';
import { AgentCliError } from '../../../../data/repository/agent_cli_contracts';
import { ApplicationError } from '../../../errors/application_error';
import { ProgressResponseContractFailure, type ProgressResponseDiagnosticFacts } from '../../../../domain/progress_response_diagnostic';
import { parseProgressScope, parseProgressScopeWithAnchors, parseScopedProgressResponse } from '../../../policies/progress_scope_policy';

const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40);
const issue = 'Implement the source.\n\nImplement the source.\n\nContext: execution is separately verified.';
const context = { issueNumber: 1, pushedBranch: 'feature/1-work', developmentBranch: 'develop', branchTypes: ['feature'],
    agentConfiguration: { provider: 'codex' as const, model: 'fixture-model' }, includeReasoning: false, targetLocale: 'en-US' };
const scopeOutput = () => ({ outputLocale: 'en-US', lines: [{ id: 'L3', kind: 'required' }, { id: 'L5', kind: 'context' }, { id: 'L1', kind: 'required' }] });
const finalOutput = () => ({ outputLocale: 'en-US', progress: 100, requirements: ['R2', 'R1'].map(id => ({
    id, status: 'supported', evidence: 'source-only', summary: 'Required source is present.', remaining: null as string | null,
})) });
type Output = ReturnType<typeof finalOutput>;
function scenario(edit: (output: Output) => unknown = output => output, source = issue, diff?: ProgressDiffEvidence) {
    const setProgressLabel = jest.fn(), setLabels = jest.fn(), outputs: string[] = [];
    const state = { head: HEAD, base: BASE, body: source, open: true };
    const execute = jest.fn<ReturnType<AgentCliPort['execute']>, Parameters<AgentCliPort['execute']>>(async request => {
        expect(setProgressLabel).not.toHaveBeenCalled(); expect(setLabels).not.toHaveBeenCalled();
        const schema = request.outputSchema as { properties: Record<string, unknown> };
        if (schema.properties.lines) return JSON.stringify(scopeOutput());
        if (schema.properties.files) {
            const id = (schema.properties.partitionId as { enum: string[] }).enum[0];
            const paths = (schema.properties.files as { items: { properties: { path: { enum: string[] } } } }).items.properties.path.enum;
            return JSON.stringify({ outputLocale: 'en-US', partitionId: id, files: paths.map(path => ({ path, implemented: 'Owned source.', remaining: 'Execution unverified.' })) });
        }
        const output = edit(finalOutput()); const text = typeof output === 'string' ? output : JSON.stringify(output); outputs.push(text); return text;
    });
    const native = new FindingsAgentAdapter({ cli: { execute } });
    const useCase = new CheckProgressUseCase({ getDescription: async () => state.body }, { getLabels: async () => [], setLabels }, { setProgressLabel },
        { getListOfBranches: async () => [] }, { getOpenPullRequestNumbersByHeadBranch: async () => [] }, native,
        { isIssueOpen: async () => state.open, getBranchHeadSha: async branch => branch === 'develop' ? state.base : state.head },
        { getDiff: async () => diff ?? ({ kind: 'single' as const, baseSha: BASE, headSha: HEAD, evidence: 'Complete owned source patch.' }) }, { getSource: async () => ({ kind: 'none' }) });
    return { invoke: () => useCase.invoke(context), execute, native, useCase, state, setProgressLabel, setLabels, outputs };
}
const unchanged = (f: ReturnType<typeof scenario>) => { expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled(); };

it('keeps host anchors separate from the unchanged scope/model JSON, including repeated quotes', () => {
    const extraction = parseProgressScopeWithAnchors(scopeOutput(), issue, 'en-US');
    expect(extraction.anchors).toEqual({ R1: 'L1', R2: 'L3' }); expect(extraction.scope).toEqual(parseProgressScope(scopeOutput(), issue, 'en-US'));
    expect(JSON.stringify(extraction.scope)).not.toMatch(/anchors|sourceLineId/u);
    expect([extraction, extraction.anchors, extraction.scope].every(Object.isFrozen)).toBe(true);
});
it('uses physical line anchors beyond the nonempty-line count without narrowing valid input', () => {
    const source = '\n'.repeat(1100) + 'Required source.';
    const extraction = parseProgressScopeWithAnchors({ outputLocale: 'en-US', lines: [{ id: 'L1101', kind: 'required' }] }, source, 'en-US');
    expect(extraction.anchors).toEqual({ R1: 'L1101' });
    const output = { outputLocale: 'en-US', progress: 100, requirements: [{ id: 'R1', status: 'supported', evidence: 'PRIVATE_BAD_VALUE', summary: 'Source.', remaining: null }] };
    expect(() => parseScopedProgressResponse(output, 'en-US', extraction.scope, extraction.anchors)).toThrow(expect.objectContaining({ recovery: expect.objectContaining({ variables: expect.objectContaining({ sourceLineId: 'L1101' }) }) }));
});
it('binds a native enum failure to R2/L3 despite response reorder and repeated issue quotes', async () => {
    const f = scenario(output => { output.requirements[0].evidence = 'PRIVATE_MODEL_EVIDENCE'; return output; });
    const result = (await f.invoke())[0];
    expect(result.errors[0]).toMatchObject({ code: 'agent.failed', recovery: { id: 'progress-result-contract-invalid', variables: {
        phase: 'assessment', reason: 'schema-enum', field: '$.requirements[0].evidence', requirementId: 'R2', sourceLineId: 'L3',
    } } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_MODEL_EVIDENCE'); expect(f.execute).toHaveBeenCalledTimes(2); unchanged(f);
});
it.each([
    ['missing-id', 'schema-required', '$.requirements[0].id', 'none', 'none'],
    ['missing-requirement', 'schema-array-short', '$.requirements', 'R2', 'L3'],
    ['duplicate', 'requirement-id-duplicate', '$.requirements[1].id', 'R2', 'L3'],
    ['outside', 'schema-enum', '$.requirements[0].id', 'none', 'none'],
    ['evidence', 'requirement-evidence-mismatch', '$.requirements[0].evidence', 'R2', 'L3'],
    ['remaining', 'requirement-remaining-invalid', '$.requirements[0].remaining', 'R2', 'L3'],
    ['percentage', 'progress-completion-mismatch', '$.progress', 'none', 'none'],
    ['unknown-field', 'schema-additional', '$.requirements[0]', 'R2', 'L3'],
])('rejects completed %s results with relevant verified detail and no progress mutation', async (mode, reason, field, requirementId, sourceLineId) => {
    const f = scenario(output => {
        if (mode === 'missing-id') delete (output.requirements[0] as Partial<Output['requirements'][number]>).id;
        if (mode === 'missing-requirement') output.requirements.shift();
        if (mode === 'duplicate') output.requirements[1].id = 'R2';
        if (mode === 'outside') output.requirements[0].id = 'PRIVATE_UNKNOWN_REQUIREMENT';
        if (mode === 'evidence') output.requirements[0].evidence = 'external-unverified';
        if (mode === 'remaining') output.requirements[0].remaining = 'PRIVATE_RETURNED_REMAINING';
        if (mode === 'percentage') output.progress = 70;
        if (mode === 'unknown-field') Object.assign(output.requirements[0], { 'PRIVATE_FIELD@all': 'PRIVATE_VALUE' });
        return output;
    });
    const result = (await f.invoke())[0]; expect(result.success).toBe(false);
    expect(result.errors[0]).toMatchObject({ recovery: { id: 'progress-result-contract-invalid', variables: { reason, field, requirementId, sourceLineId } } });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|@all/u); expect(f.execute).toHaveBeenCalledTimes(2); unchanged(f);
});
it('rejects malformed completed task text without a fabricated requirement/anchor', async () => {
    const f = scenario(() => 'PRIVATE_MALFORMED_RESULT'); const result = (await f.invoke())[0];
    expect(result.errors[0]).toMatchObject({ recovery: { variables: { reason: 'json-invalid', field: '$', requirementId: 'none', sourceLineId: 'none' } } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_MALFORMED_RESULT'); unchanged(f);
});
it('keeps native process failure distinct and preserves its narrowed retryability', async () => {
    const f = scenario(); const original = f.execute.getMockImplementation()!;
    f.execute.mockImplementation(async request => {
        if ((request.outputSchema as { properties: Record<string, unknown> }).properties.requirements) throw new AgentCliError('PRIVATE_PROCESS_TEXT', 'process', false, 1);
        return original(request);
    });
    const result = (await f.invoke())[0]; expect(result.errors[0]).toMatchObject({ code: 'agent.failed', retryable: false });
    expect(result.errors[0].recovery).toBeUndefined(); expect(JSON.stringify(result)).not.toContain('PRIVATE_PROCESS_TEXT'); unchanged(f);
});
it('supports one fresh same-source attempt after a rejected result without adding automatic retries', async () => {
    let invalid = true; const f = scenario(output => { if (invalid) output.requirements[0].evidence = 'bad'; return output; });
    expect((await f.invoke())[0].success).toBe(false); expect(f.execute).toHaveBeenCalledTimes(2); unchanged(f);
    invalid = false; expect((await f.invoke())[0]).toMatchObject({ success: true, payload: { progress: 100 } });
    expect(f.execute).toHaveBeenCalledTimes(4); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
});
it.each(['head', 'base', 'body', 'open'])('keeps the existing native %s fence after a valid completed result', async key => {
    const f = scenario(output => {
        if (key === 'head') f.state.head = 'd'.repeat(40);
        if (key === 'base') f.state.base = 'd'.repeat(40);
        if (key === 'body') f.state.body = 'New acceptance.';
        if (key === 'open') f.state.open = false;
        return output;
    });
    const result = (await f.invoke())[0];
    if (key === 'body') expect(result.errors[0].code).toBe('workflow.stale'); else expect(result.executed).toBe(false);
    unchanged(f);
});

const host: ProgressResponseHostContext = { phase: 'assessment', requirementIds: ['R1', 'R2'], sourceLineIds: ['L1', 'L3'], anchors: { R1: 'L1', R2: 'L3' } };
const diagnostic = (edit: Partial<ProgressResponseDiagnosticFacts> = {}) => new ProgressResponseContractFailure({ phase: 'assessment', reason: 'schema-enum',
    field: '$.requirements[0].evidence', requirementId: 'R2', sourceLineId: 'none', ...edit });
const request = { configuration: context.agentConfiguration, agentId: 'plan', prompt: 'Owned query fixture.' };
it('does not grant current source authority to a foreign requirement in a typed adapter error', async () => {
    await expect(queryProgressResult({ query: async () => { throw diagnostic({ requirementId: 'R32', sourceLineId: 'L1' }); } }, request, host))
        .rejects.toMatchObject({ recovery: { variables: { requirementId: 'none', sourceLineId: 'none' } } });
});
it('rejects a phase mismatch without publishing that foreign diagnostic', async () => {
    const error = new ProgressResponseContractFailure({ phase: 'partition', reason: 'partition-id-invalid', field: '$.partitionId', requirementId: 'none', sourceLineId: 'none' });
    await expect(queryProgressResult({ query: async () => { throw error; } }, request, host)).rejects.toMatchObject({ code: 'agent.failed', recovery: undefined });
});
it('does not bind a line outside the current host source inventory', async () => {
    await expect(queryProgressResult({ query: async () => { throw diagnostic(); } }, request, { ...host, anchors: { R2: 'L999' } }))
        .rejects.toMatchObject({ recovery: { variables: { requirementId: 'R2', sourceLineId: 'none' } } });
});
it('keeps absent legacy host anchors explicitly unavailable', async () => {
    await expect(queryProgressResult({ query: async () => { throw diagnostic(); } }, request, { phase: 'assessment' }))
        .rejects.toMatchObject({ recovery: { variables: { requirementId: 'none', sourceLineId: 'none' } } });
});
it.each(['provider.unavailable', 'authorization.denied', 'timeout', 'workflow.cancelled'] as const)('preserves unrelated %s errors and correlation identity', async code => {
    const error = new ApplicationError(code, 'Owned failure', { correlationId: '11111111-1111-4111-8111-111111111111' });
    await expect(queryProgressResult({ query: async () => { throw error; } }, request, host)).rejects.toBe(error);
});
it('intersects native scope-line detail with the actual source inventory', async () => {
    const error = new ProgressResponseContractFailure({ phase: 'scope', reason: 'schema-enum', field: '$.lines[0].kind', requirementId: 'none', sourceLineId: 'L999' });
    await expect(queryProgressResult({ query: async () => { throw error; } }, request, { phase: 'scope', sourceLineIds: ['L1'] }))
        .rejects.toMatchObject({ recovery: { variables: { sourceLineId: 'none', requirementId: 'none' } } });
});

it('binds a native scope-stage enum rejection to the exact original physical line', async () => {
    const f = scenario(), output = scopeOutput(); output.lines[0].kind = 'PRIVATE_SCOPE_KIND'; f.execute.mockResolvedValueOnce(JSON.stringify(output));
    const result = (await f.invoke())[0];
    expect(result.errors[0]).toMatchObject({ recovery: { variables: { phase: 'scope', reason: 'schema-enum', field: '$.lines[0].kind', requirementId: 'none', sourceLineId: 'L3' } } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SCOPE_KIND'); expect(f.execute).toHaveBeenCalledTimes(1); unchanged(f);
});
it('retains progress on a late native partition rejection before any final assessment', async () => {
    const diff = partitionProgressDiff(BASE, HEAD, ['a.md', 'b.md'].map(path => ({ path, status: 'added', additions: 1, deletions: 0, patch: 'x'.repeat(150_000) })));
    const f = scenario(output => output, issue, diff), original = f.execute.getMockImplementation()!; let parts = 0;
    f.execute.mockImplementation(async request => {
        const output = await original(request);
        if ((request.outputSchema as { properties: Record<string, unknown> }).properties.files && ++parts === 2) {
            const payload = JSON.parse(output); payload.partitionId = 'PRIVATE_WRONG_PART'; return JSON.stringify(payload);
        }
        return output;
    });
    const result = (await f.invoke())[0];
    expect(result.errors[0]).toMatchObject({ recovery: { variables: { phase: 'partition', reason: 'schema-enum', field: '$.partitionId', requirementId: 'none', sourceLineId: 'none' } } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_WRONG_PART'); expect(f.execute).toHaveBeenCalledTimes(3); unchanged(f);
});
