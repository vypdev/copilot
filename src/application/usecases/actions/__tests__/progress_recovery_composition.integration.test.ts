import { withProgressEvidence } from './support/progress_batch_response';
import { CheckProgressUseCase } from '../check_progress_use_case';
import { FindingsAgentAdapter } from '../../../../data/repository/ai/findings_agent_adapter';
import type { AgentCliPort } from '../../../../infrastructure/agents/ports/agent_provider_ports';
import type { ProgressDiffEvidence } from '../../../ports/progress_diff_query_ports';
import { partitionProgressDiff } from '../../../policies/progress_diff_partition_policy';
import { largeCompleteProgressFixture } from '../../../../data/repository/__tests__/support/large_complete_progress_fixture';
import { addedFiles, inventoryFixture } from '../../../../data/repository/__tests__/support/immutable_progress_inventory_fixture';
import { summarizeProgressDiff } from '../summarize_progress_diff_workflow';
import { boundProgressBatchAgent } from '../../../policies/progress_batch_query_policy';
import { PROGRESS_BATCH_PROFILE } from '../../../policies/progress_batch_policy';
import { bindProgressEvidence } from '../../../policies/progress_evidence_protocol_policy';
import type { FindingsQueryRequest } from '../../../ports/agent_findings_ports';

const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40);
const context = { repositoryIdentity: 'owner/repo', issueNumber: 830, pushedBranch: 'bugfix/830-work', developmentBranch: 'develop', branchTypes: ['bugfix'],
    agentConfiguration: { provider: 'codex' as const, model: 'fixture-model' }, includeReasoning: false, targetLocale: 'en-US' };
function scenario(mode: 'success' | 'final-exhausted' | 'part-exhausted' | 'escaped-fact', completeSource?: ReturnType<typeof largeCompleteProgressFixture>) {
    let diff: ProgressDiffEvidence;
    const getDiff = jest.fn(async () => diff = completeSource ? await completeSource.read() : partitionProgressDiff(BASE, HEAD,
        ['first.ts', 'last.ts'].map(path => ({ path, status: 'added', additions: 1, deletions: 0, patch: 'x'.repeat(150_000) }))));
    const setProgressLabel = jest.fn(), setLabels = jest.fn(), partCalls = new Map<string, number>();
    const requests: { prompt: string; schema: unknown }[] = [];
    let finalCalls = 0;
    const execute = jest.fn<ReturnType<AgentCliPort['execute']>, Parameters<AgentCliPort['execute']>>(async request => {
        expect(setProgressLabel).not.toHaveBeenCalled(); expect(setLabels).not.toHaveBeenCalled();
        requests.push({ prompt: request.prompt, schema: request.outputSchema });
        const schema = request.outputSchema as { properties: { lines?: unknown; partitionId?: { enum: readonly string[] };
            files?: { items: { properties: { implemented: { maxLength: number }; unitId?: { enum: readonly string[] }; path: { enum: readonly string[] } } } } } };
        if (schema.properties.lines) return JSON.stringify({ outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }, { id: 'L2', kind: 'required' }] });
        if (schema.properties.files) {
            if (diff.kind !== 'partitioned') throw new Error('Expected whole multipart comparison');
            const id = schema.properties.partitionId!.enum[0], units = schema.properties.files.items.properties.unitId?.enum;
            const part = units ? diff.partitions.find(p => p.units?.length === units.length && p.units.every((unit, i) => unit.id === units[i]))!
                : diff.partitions.find(p => p.id === id)!;
            const attempt = (partCalls.get(id) ?? 0) + 1; partCalls.set(id, attempt);
            const files = part.units ? part.units.map(unit => ({ unitId: unit.id, path: unit.path, implemented: 'Source.', remaining: 'Unknown.' }))
                : part.paths.map(path => ({ path, implemented: 'Source.', remaining: 'Unknown.' }));
            if (mode === 'escaped-fact') {
                const limit = schema.properties.files.items.properties.implemented.maxLength;
                files[0].remaining = '\u0001'.repeat(limit);
            }
            const selected = completeSource ? diff.partitions.at(-1)! : diff.partitions[0];
            if (part === selected && (attempt === 1 || mode === 'part-exhausted')) {
                files[0].implemented = 'PRIVATE_REJECTED_PART_' + 'x'.repeat(schema.properties.files.items.properties.implemented.maxLength);
            }
            return JSON.stringify({ outputLocale: 'en-US', partitionId: id, files });
        }
        finalCalls++;
        return JSON.stringify({ outputLocale: 'en-US', progress: mode === 'final-exhausted' || finalCalls === 1 ? 70 : 100,
            requirements: ['R1', 'R2'].map(id => ({ id, status: 'supported', evidence: 'source-only', remaining: null,
                summary: finalCalls === 1 ? 'PRIVATE_REJECTED_FINAL @all' : 'Source is present.' })) });
    });
    const useCase = new CheckProgressUseCase({ getDescription: async () => 'Implement first source requirement.\nImplement second source requirement.' },
        { getLabels: async () => [], setLabels }, { setProgressLabel }, { getListOfBranches: async () => [] },
        { getOpenPullRequestNumbersByHeadBranch: async () => [] }, new FindingsAgentAdapter({ cli: { execute: async request => withProgressEvidence(await execute(request), request.outputSchema) } }),
        { isIssueOpen: async () => true, getBranchHeadSha: async branch => branch === 'develop' ? BASE : HEAD },
        { getDiff }, { getSource: async () => ({ kind: 'none' }) });
    return { invoke: () => useCase.invoke(context), execute, getDiff, setProgressLabel, setLabels, requests, partCalls, finalCalls: () => finalCalls, diff: () => diff };
}
const noPublication = (f: ReturnType<typeof scenario>) => {
    expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
};
it('progress-partition-composition-C01: part and final replacements retain separate single allowances and publish once', async () => {
    const f = scenario('success');
    expect((await f.invoke())[0]).toMatchObject({ success: true, payload: { progress: 100 } });
    expect(f.execute).toHaveBeenCalledTimes(6); expect(f.finalCalls()).toBe(2); expect([...f.partCalls.values()]).toEqual([2, 1]);
    expect(f.getDiff).toHaveBeenCalledTimes(1); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
    for (const request of f.requests) expect(request.prompt).not.toMatch(/PRIVATE_REJECTED/u);
});
it('progress-partition-composition-C02: late repaired immutable part cannot publish when both final estimates contradict completion', async () => {
    const source = largeCompleteProgressFixture(), f = scenario('final-exhausted', source); const result = (await f.invoke())[0];
    expect(result).toMatchObject({ success: false, errors: [{ recovery: { id: 'progress-completion-recovery-exhausted', variables: {
        reportedProgress: 70, requirementCount: 2, supportedCount: 2, missingCount: 0, unknownCount: 0,
    } } }] });
    const diff = f.diff(); if (diff.kind !== 'partitioned') throw new Error('Expected complete immutable comparison');
    expect(diff.protocol).toMatchObject({ unitCount: 952, recovery: { total: { files: 887, bytes: 6503131 } } });
    expect(f.execute).toHaveBeenCalledTimes(diff.partitions.length + 4); expect(f.finalCalls()).toBe(2);
    expect([...f.partCalls.values()].filter(count => count === 2)).toEqual([2]);
    expect(f.partCalls.size).toBe(diff.partitions.length); expect(f.getDiff).toHaveBeenCalledTimes(1);
    expect(source.getBlob).toHaveBeenCalledTimes(947); expect(source.compareCommits).toHaveBeenCalledTimes(2);
    noPublication(f); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_REJECTED/u);
}, 60000);
it('progress-partition-composition-C03: persistent part overflow terminates without spending or entering the final allowance', async () => {
    const f = scenario('part-exhausted'); const result = (await f.invoke())[0];
    expect(result).toMatchObject({ success: false, errors: [{ recovery: { id: 'progress-partition-length-invalid' } }] });
    expect(f.execute).toHaveBeenCalledTimes(3); expect([...f.partCalls.values()]).toEqual([2]); expect(f.finalCalls()).toBe(0);
    expect(f.getDiff).toHaveBeenCalledTimes(1); noPublication(f); expect(JSON.stringify(result)).not.toContain('PRIVATE_REJECTED');
});

it('progress-partition-composition-C04: excessive escaped bytes exhaust one part replacement without a final query or publication', async () => {
    const f = scenario('escaped-fact', largeCompleteProgressFixture());
    const result = (await f.invoke())[0];
    expect(result).toMatchObject({ success: false, errors: [{ recovery: {
        id: 'progress-partition-bytes-invalid', variables: expect.objectContaining({ field: '$.files[0].remaining' }),
    } }] });
    expect(f.partCalls.size).toBe(PROGRESS_BATCH_PROFILE.immutableTreeConcurrency);
    expect([...f.partCalls.values()]).toEqual(Array(PROGRESS_BATCH_PROFILE.immutableTreeConcurrency).fill(2));
    expect(f.execute).toHaveBeenCalledTimes(1 + 2 * PROGRESS_BATCH_PROFILE.immutableTreeConcurrency);
    expect(f.finalCalls()).toBe(0);
    noPublication(f);
}, 60000);

it('collects immutable parts concurrently within the same deadline and retains the original receipt order', async () => {
    const files = { ...addedFiles(), ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [
        `large/${index}.ts`, `export const data${index} = '${'x'.repeat(145_000)}';`,
    ])) };
    const issueDescription = 'Implement source.';
    const scope = 'R1';
    const diff = bindProgressEvidence(await inventoryFixture({}, files).read(), issueDescription, scope, context.targetLocale);
    if (diff.kind !== 'partitioned') throw new Error('Expected complete immutable comparison');
    expect(diff.protocol?.version).toBe('immutable-tree-v1');
    expect(diff.partitions.length).toBeGreaterThan(PROGRESS_BATCH_PROFILE.immutableTreeConcurrency);
    const expected = diff.partitions.map(part => part.id);
    let now = 0, active = 0, peak = 0;
    const finished: string[] = [];
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        const id = (request.options!.schema!.properties as { partitionId: { enum: string[] } }).partitionId.enum[0];
        const part = diff.partitions.find(item => item.id === id)!;
        peak = Math.max(peak, ++active);
        const completes = now + 300_000;
        // The first request takes a second tick. Concurrent completions share simulated wall time.
        await new Promise(resolve => setImmediate(resolve));
        if (id === expected[0]) await new Promise(resolve => setImmediate(resolve));
        now = Math.max(now, completes + (id === expected[0] ? 1 : 0));
        active--;
        finished.push(id);
        return { outputLocale: 'en-US', partitionId: id, files: part.units!.map(unit => ({
            unitId: unit.id, path: unit.path, implemented: 'Present.', remaining: 'Unknown.',
        })) };
    });
    const { agent, calls } = boundProgressBatchAgent({ query }, () => now);
    const result = JSON.parse(await summarizeProgressDiff(diff, context, issueDescription, agent, 384_000, scope,
        PROGRESS_BATCH_PROFILE.immutableTreeConcurrency));
    expect(peak).toBe(PROGRESS_BATCH_PROFILE.immutableTreeConcurrency);
    expect(finished[0]).not.toBe(expected[0]);
    expect(result.sources.map((part: { requestId: string }) => part.requestId)).toEqual(expected);
    expect(calls()).toBe(expected.length);
    expect(expected.length * 300_000).toBeGreaterThan(PROGRESS_BATCH_PROFILE.milliseconds);
    expect(now).toBeLessThan(PROGRESS_BATCH_PROFILE.milliseconds);
});
