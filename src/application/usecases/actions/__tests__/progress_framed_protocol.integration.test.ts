import { CheckProgressUseCase } from '../check_progress_use_case';
import { framed, clone, BASE, HEAD, type Multipart } from '../../../policies/__tests__/fixtures/framed_progress_fixture';
import type { FindingsQueryRequest } from '../../../ports/agent_findings_ports';
import { buildAgentPrompt } from '../../../policies/agent_prompt_envelope_policy';
import { AGENT_PROMPT_MAX_BYTES } from '../../../../domain/agent_execution_plan';

const context = { issueNumber: 1, pushedBranch: 'feature/1-work', developmentBranch: 'develop', branchTypes: ['feature'],
    agentConfiguration: { provider: 'codex' as const, model: 'fixture-model' }, includeReasoning: false, targetLocale: 'en-US' };
function scenario(source: Multipart = clone(framed())) {
    const setProgressLabel = jest.fn(), setLabels = jest.fn(); let partIndex = 0;
    const state = { issue: 'Complete both specifications.', base: BASE, head: HEAD, open: true };
    const captured: Record<string, unknown>[] = [];
    const answer = async (request: FindingsQueryRequest): Promise<Record<string, unknown>> => {
        expect(setProgressLabel).not.toHaveBeenCalled(); expect(setLabels).not.toHaveBeenCalled();
        expect(Buffer.byteLength(buildAgentPrompt(request.prompt, true, request.options!.schema, request.options!.schemaName!))).toBeLessThanOrEqual(AGENT_PROMPT_MAX_BYTES);
        if (request.options?.schemaName === 'progress_scope') return { outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }] };
        if (request.options?.schemaName === 'progress_partition_facts') {
            const schema = request.options.schema as { properties: { partitionId: { enum: string[] } } };
            const part = source.partitions[partIndex++];
            const response = { outputLocale: 'en-US', partitionId: schema.properties.partitionId.enum[0], files: part.units!.map(unit => ({ unitId: unit.id,
                path: unit.path, implemented: 'Required source supplied.', remaining: 'Execution unverified.' })) };
            captured.push(response); return response;
        }
        expect(partIndex).toBe(source.partitions.length);
        return { outputLocale: 'en-US', progress: 100, requirements: [{ id: 'R1', status: 'supported', evidence: 'source-only', summary: 'All required source is present.', remaining: null }] };
    };
    const query = jest.fn(answer), getDescription = jest.fn(async () => state.issue);
    const useCase = new CheckProgressUseCase({ getDescription }, { getLabels: async () => [], setLabels }, { setProgressLabel },
        { getListOfBranches: async () => [] }, { getOpenPullRequestNumbersByHeadBranch: async () => [] }, { query },
        { isIssueOpen: async () => state.open, getBranchHeadSha: async branch => branch === 'develop' ? state.base : state.head },
        { getDiff: async () => source }, { getSource: async () => ({ kind: 'none' }) });
    return { state, source, query, answer, captured, setProgressLabel, setLabels, invoke: () => useCase.invoke(context) };
}
const unchanged = (f: ReturnType<typeof scenario>) => { expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled(); };

it('supplies exact framed evidence and full envelopes to all stages before one final publication', async () => {
    const f = scenario(); expect((await f.invoke())[0]).toMatchObject({ success: true, payload: { progress: 100 } });
    expect(f.query).toHaveBeenCalledTimes(4); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
    const final = f.query.mock.calls.at(-1)![0].prompt;
    expect(final).toContain(f.source.protocol!.attemptId); expect(final).toContain(f.source.protocol!.manifestDigest);
    expect(f.captured.every(response => String(response.partitionId).startsWith('progress-request-'))).toBe(true);
});
it.each(['missing', 'reordered', 'corrupt'])('rejects a %s source before any model request', async mode => {
    const original = clone(framed()); const source = { ...original, partitions: [...original.partitions] };
    if (mode === 'missing') source.partitions.pop();
    if (mode === 'reordered') source.partitions.reverse();
    if (mode === 'corrupt') source.partitions[1] = { ...source.partitions[1], evidence: '{}' };
    const f = scenario(source); expect((await f.invoke())[0].success).toBe(false); expect(f.query).not.toHaveBeenCalled(); unchanged(f);
});
it.each(['wrong-id', 'missing-file', 'extra-file', 'wrong-unit', 'wrong-path', 'wrong-locale'])('retains progress on a rejected late response: %s', async mode => {
    const f = scenario(); f.query.mockImplementation(async request => {
        const result = await f.answer(request);
        if (f.captured.length === 2 && request.options?.schemaName === 'progress_partition_facts') {
            const payload = result as { partitionId: string; outputLocale: string; files: { unitId: string; path: string }[] };
            if (mode === 'wrong-id') payload.partitionId = 'replayed-attempt';
            if (mode === 'missing-file') payload.files = [];
            if (mode === 'extra-file') payload.files.push(payload.files[0]);
            if (mode === 'wrong-unit') payload.files[0].unitId = 'file-0';
            if (mode === 'wrong-path') payload.files[0].path = 'unassigned';
            if (mode === 'wrong-locale') payload.outputLocale = 'es-ES';
        }
        return result;
    });
    expect((await f.invoke())[0].success).toBe(false); expect(f.query).toHaveBeenCalledTimes(3); unchanged(f);
});
it('rejects replaying the first response as the second complete part', async () => {
    const f = scenario(); f.query.mockImplementation(async request => {
        const result = await f.answer(request);
        return f.captured.length === 2 ? f.captured[0] : result;
    });
    expect((await f.invoke())[0].success).toBe(false); expect(f.query).toHaveBeenCalledTimes(3); unchanged(f);
});
it('does not expose partial facts or labels after an interrupted middle round', async () => {
    const f = scenario(); f.query.mockImplementation(async request => {
        if (f.captured.length === 1) throw Error('owned interrupted fixture'); return f.answer(request);
    });
    expect((await f.invoke())[0].success).toBe(false); expect(f.query).toHaveBeenCalledTimes(3); unchanged(f);
});
it.each(['head', 'base', 'issue', 'open'])('retains labels if native %s changes after complete multipart analysis', async key => {
    const f = scenario(); f.query.mockImplementation(async request => {
        const response = await f.answer(request);
        if (request.options?.schemaName !== 'progress_scope' && request.options?.schemaName !== 'progress_partition_facts') {
            if (key === 'head') f.state.head = 'd'.repeat(40);
            if (key === 'base') f.state.base = 'd'.repeat(40);
            if (key === 'issue') f.state.issue = 'New scope.';
            if (key === 'open') f.state.open = false;
        }
        return response;
    });
    const result = (await f.invoke())[0];
    if (key === 'issue') expect(result.errors[0]).toMatchObject({ code: 'workflow.stale' });
    else expect(result).toMatchObject({ success: true, executed: false });
    unchanged(f);
});
it('refuses final publication when the final model contract fails after all source parts', async () => {
    const f = scenario(); f.query.mockImplementation(async request => {
        const response = await f.answer(request);
        return request.options?.schemaName === 'progress_response' ? { ...response, requirements: [] } : response;
    });
    expect((await f.invoke())[0].success).toBe(false); expect(f.query).toHaveBeenCalledTimes(4); unchanged(f);
});
