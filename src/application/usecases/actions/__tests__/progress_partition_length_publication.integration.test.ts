import { withProgressEvidence } from './support/progress_batch_response';
import { CheckProgressUseCase } from '../check_progress_use_case';
import { framed, clone, BASE, HEAD } from '../../../policies/__tests__/fixtures/framed_progress_fixture';
import { FindingsAgentAdapter } from '../../../../data/repository/ai/findings_agent_adapter';
import type { AgentCliPort } from '../../../../infrastructure/agents/ports/agent_provider_ports';
import { interpretProgressAgentOutput } from '../../../../data/repository/progress_agent_response_policy';
import { completeInventoryScenario } from './fixtures/complete_inventory_workflow_fixture';
import { largeCompleteProgressFixture } from '../../../../data/repository/__tests__/support/large_complete_progress_fixture';

const context = { repositoryIdentity: 'owner/repo', issueNumber: 830, pushedBranch: 'bugfix/830-output', developmentBranch: 'develop', branchTypes: ['bugfix'],
    agentConfiguration: { provider: 'codex' as const, model: 'fixture-model' }, includeReasoning: false, targetLocale: 'en-US' };
function scenario(mode: 'recover' | 'persistent' | 'stale') {
    const source = clone(framed()), units = source.partitions.flatMap(part => part.units!), calls = new Map<string, number>();
    const setProgressLabel = jest.fn(), setLabels = jest.fn(), state = { head: HEAD };
    const execute = jest.fn<ReturnType<AgentCliPort['execute']>, Parameters<AgentCliPort['execute']>>(async request => {
        expect(setProgressLabel).not.toHaveBeenCalled(); expect(setLabels).not.toHaveBeenCalled();
        const schema = request.outputSchema as { properties: Record<string, unknown> };
        if (schema.properties.lines) return JSON.stringify({ outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }] });
        if (schema.properties.files) {
            const id = (schema.properties.partitionId as { enum: string[] }).enum[0], count = (calls.get(id) ?? 0) + 1; calls.set(id, count);
            const admitted = (schema.properties.files as { items: { properties: { unitId: { enum: string[] } } } }).items.properties.unitId.enum;
            const files = admitted.map(unitId => {
                const unit = units.find(unit => unit.id === unitId)!;
                const fail = unitId === 'file-1' && (mode === 'persistent' || count === 1);
                return { unitId, path: unit.path, implemented: fail ? 'PRIVATE_RESPONSE_'.repeat(50) : 'Required source.', remaining: 'Unverified.' };
            });
            return JSON.stringify({ outputLocale: 'en-US', partitionId: id, files });
        }
        if (mode === 'stale') state.head = 'c'.repeat(40);
        return JSON.stringify({ outputLocale: 'en-US', progress: 100, requirements: [{ id: 'R1', status: 'supported', evidence: 'source-only', summary: 'Required source is present.', remaining: null }] });
    });
    const native = new FindingsAgentAdapter({ cli: { execute: async request => withProgressEvidence(await execute(request), request.outputSchema) } });
    const useCase = new CheckProgressUseCase({ getDescription: async () => 'Implement both files.' }, { getLabels: async () => [], setLabels }, { setProgressLabel },
        { getListOfBranches: async () => [] }, { getOpenPullRequestNumbersByHeadBranch: async () => [] }, native,
        { isIssueOpen: async () => true, getBranchHeadSha: async branch => branch === 'develop' ? BASE : state.head },
        { getDiff: async () => source }, { getSource: async () => ({ kind: 'none' }) });
    return { invoke: () => useCase.invoke(context), execute, setProgressLabel, setLabels };
}
it('publishes once only after the complete framed comparison, replacement and final assessment pass', async () => {
    const f = scenario('recover'); expect((await f.invoke())[0]).toMatchObject({ success: true, payload: { progress: 100 } });
    expect(f.execute).toHaveBeenCalledTimes(5); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
});
it('retains old labels and omits final assessment after persistent late-part overflow', async () => {
    const f = scenario('persistent'), result = (await f.invoke())[0];
    expect(result).toMatchObject({ success: false, errors: [expect.objectContaining({ recovery: { id: 'progress-partition-length-invalid', variables: expect.objectContaining({
        filePath: 'specs/b.md', unitId: 'file-1', field: '$.files[0].implemented', maximum: 600, observed: 850,
    }) } })] });
    expect(f.execute).toHaveBeenCalledTimes(4); expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('PRIVATE_RESPONSE_');
});
it('cannot publish a recovered assessment after its native source head moves', async () => {
    const f = scenario('stale'); expect((await f.invoke())[0]).toMatchObject({ executed: false });
    expect(f.execute).toHaveBeenCalledTimes(5); expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
});
it('recovers one fact in the complete 887-path immutable-tree workload without recollection, omission or a lost round', async () => {
    const f = completeInventoryScenario(largeCompleteProgressFixture()), accepted = new Map<string, Record<string, unknown>>();
    let reads = 0;
    f.query.mockImplementation(async request => {
        if (request.options?.schemaName !== 'progress_partition_facts') return f.answer(request);
        const schema = request.options.schema as { properties: { partitionId: { enum: string[] } } }, id = schema.properties.partitionId.enum[0];
        let response = accepted.get(id);
        if (!response) {
            response = await f.answer(request); accepted.set(id, structuredClone(response));
            if (accepted.size === 1) { reads = f.source.getBlob.mock.calls.length; (response.files as Record<string, unknown>[])[0].remaining = 'PRIVATE_RESPONSE_'.repeat(50); }
        } else response = structuredClone(response);
        return interpretProgressAgentOutput(JSON.stringify(response), 'partition', request.options.schema!);
    });
    expect((await f.invoke())[0]).toMatchObject({ success: true, payload: { progress: 100 } });
    const diff = f.diff(); if (diff?.kind !== 'partitioned') throw Error('Expected complete framed source');
    expect(diff.protocol).toMatchObject({ version: 'immutable-tree-v1', unitCount: 952 }); expect(diff.protocol!.requiredPaths).toHaveLength(887);
    expect(f.parts()).toBe(diff.partitions.length); expect(f.query).toHaveBeenCalledTimes(diff.partitions.length + 3);
    expect(f.source.getBlob).toHaveBeenCalledTimes(reads); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
}, 60_000);
