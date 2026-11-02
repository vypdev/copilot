import { summarizeProgressDiff } from '../summarize_progress_diff_workflow';
import { FindingsAgentAdapter } from '../../../../data/repository/ai/findings_agent_adapter';
import type { AgentCliPort } from '../../../../infrastructure/agents/ports/agent_provider_ports';
import type { ProgressDiffEvidence } from '../../../ports/progress_diff_query_ports';
import { queryProgressPartition } from '../query_progress_partition_workflow';
import { progressPartitionResponseSchema } from '../../../policies/progress_partition_response_policy';
import { productFacingAgentQueryOptions } from '../../../policies/agent_output_locale_policy';

const context = { issueNumber: 830, pushedBranch: 'bugfix/830-output', developmentBranch: 'develop', branchTypes: ['bugfix'],
    agentConfiguration: { provider: 'codex' as const, model: 'fixture-model' }, includeReasoning: false, targetLocale: 'en-US' };
const diff: Extract<ProgressDiffEvidence, { kind: 'partitioned' }> = { kind: 'partitioned', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), evidence: 'Complete pinned evidence.',
    partitions: ['first.ts', 'second.ts'].map((path, index) => ({ id: `part-${index + 1}`, paths: [path], evidence: `Complete immutable source for ${path}.` })) };
const privateText = 'PRIVATE_RESPONSE_' + '🧪'.repeat(601);
function scenario(field: 'implemented' | 'remaining', persistent = false, index = 0) {
    const calls = new Map<string, number>();
    const execute = jest.fn<ReturnType<AgentCliPort['execute']>, Parameters<AgentCliPort['execute']>>(async request => {
        const schema = request.outputSchema as { properties: { partitionId: { enum: string[] }; files: { items: { properties: { path: { enum: string[] } } } } } };
        const id = schema.properties.partitionId.enum[0], count = (calls.get(id) ?? 0) + 1; calls.set(id, count);
        const fail = id === diff.partitions[index].id && (persistent || count === 1);
        return JSON.stringify({ outputLocale: 'en-US', partitionId: id, files: schema.properties.files.items.properties.path.enum.map(path => ({
            path, implemented: 'Current immutable source.', remaining: 'Verification unknown.', ...(fail ? { [field]: privateText } : {}),
        })) });
    });
    const agent = new FindingsAgentAdapter({ cli: { execute } });
    return { execute, invoke: () => summarizeProgressDiff(diff, context, 'Implement the complete source.', agent, 384_000, 'R1: Implement the source.') };
}

it.each(['implemented', 'remaining'] as const)('recovers an over-bound %s fact with the same schema and all immutable parts', async field => {
    const f = scenario(field); const result = JSON.parse(await f.invoke());
    expect(result.files.map((file: { path: string }) => file.path)).toEqual(['first.ts', 'second.ts']);
    expect(f.execute).toHaveBeenCalledTimes(3);
    const [first, replacement] = f.execute.mock.calls.map(([request]) => request);
    expect(replacement.outputSchema).toEqual(first.outputSchema);
    expect(replacement.prompt).toContain('Complete immutable source for first.ts.');
    expect(replacement.prompt).not.toContain('PRIVATE_RESPONSE_'); expect(JSON.stringify(result)).not.toContain('PRIVATE_RESPONSE_');
});
it.each(['implemented', 'remaining'] as const)('retains the earlier accepted part when a later %s fact needs recovery', async field => {
    const f = scenario(field, false, 1); const result = JSON.parse(await f.invoke());
    expect(result.files.map((file: { path: string }) => file.path)).toEqual(['first.ts', 'second.ts']);
    expect(f.execute).toHaveBeenCalledTimes(3);
    expect(f.execute.mock.calls[1][0].outputSchema).toEqual(f.execute.mock.calls[2][0].outputSchema);
});
it.each(['implemented', 'remaining'] as const)('bounds persistent %s overflow and identifies its exact part/file and Unicode lengths', async field => {
    const f = scenario(field, true);
    await expect(f.invoke()).rejects.toMatchObject({ code: 'agent.failed', recovery: { id: 'progress-partition-length-invalid', variables: {
        partitionId: 'part-1', filePath: 'first.ts', unitId: 'none', field: `$.files[0].${field}`, maximum: 600, observed: [...privateText].length,
    } } });
    expect(f.execute).toHaveBeenCalledTimes(2);
});

it.each(['implemented', 'remaining'] as const)('preserves an adaptive 16-code-point bound while replacing %s', async field => {
    const part = diff.partitions[0], schema = progressPartitionResponseSchema(part, 16);
    const valid = { outputLocale: 'en-US', partitionId: part.id, files: [{ path: 'first.ts', implemented: 'Current source.', remaining: 'Unknown.' }] };
    const execute = jest.fn().mockResolvedValueOnce(JSON.stringify({ ...valid, files: [{ ...valid.files[0], [field]: '🧪'.repeat(17) }] }))
        .mockResolvedValueOnce(JSON.stringify(valid));
    const agent = new FindingsAgentAdapter({ cli: { execute } });
    await expect(queryProgressPartition(agent, { agentId: 'plan', configuration: context.agentConfiguration, prompt: 'Complete immutable source.',
        options: productFacingAgentQueryOptions('progress-partition', schema) }, part, 16, 'en-US')).resolves.toEqual(valid);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][0].outputSchema).toEqual(schema);
    expect(execute.mock.calls[1][0].prompt).not.toContain('🧪');
});
