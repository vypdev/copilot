import { parseScopedProgressResponse, scopedProgressResponseSchema } from '../progress_scope_policy';
import { parseProgressPartitionFacts } from '../progress_partition_response_policy';
import { FindingsAgentAdapter } from '../../../data/repository/ai/findings_agent_adapter';
import { productFacingAgentQueryOptions } from '../agent_output_locale_policy';

const scope = { requirements: [{ id: 'R1', quote: 'First source requirement.' }, { id: 'R2', quote: 'Second source requirement.' }], exclusions: [] };
const result = () => ({ outputLocale: 'en-US', progress: 100, requirements: scope.requirements.map(requirement => ({
    id: requirement.id, status: 'supported', evidence: 'source-only', summary: 'Required source is present.', remaining: null as string | null,
})) });
const variables = (phase: string, reason: string, field: string, requirementId = 'none') => ({ phase, reason, field, requirementId, sourceLineId: 'none' });
function thrown(action: () => unknown): unknown { try { action(); } catch (error) { return error; } throw Error('Expected fixture rejection'); }
function adapter(output: string) {
    const execute = jest.fn(async () => output);
    return { native: new FindingsAgentAdapter({ cli: { execute } }), execute };
}
const request = { configuration: { provider: 'codex' as const, model: 'fixture-model' }, agentId: 'plan', prompt: 'Owned progress fixture.',
    options: productFacingAgentQueryOptions('progress', scopedProgressResponseSchema(scope)) };

it('retains strict semantic rejection with the actual field and verified requirement ID', () => {
    const response = result(); response.requirements[1].remaining = 'Still missing.';
    expect(thrown(() => parseScopedProgressResponse(response, 'en-US', scope))).toMatchObject({ code: 'agent.failed', recovery: {
        id: 'progress-result-contract-invalid', variables: variables('assessment', 'requirement-remaining-invalid', '$.requirements[1].remaining', 'R2'),
    } });
});
it('keeps the unchanged successful result shape', () => {
    expect(parseScopedProgressResponse(result(), 'en-US', scope)).toEqual({ progress: 100,
        summary: '[R1] First source requirement. — Required source is present.\n[R2] Second source requirement. — Required source is present.', remaining: '', reasoning: '' });
});
it('diagnoses a mismatched completed part without accepting its facts', () => {
    const part = { id: 'owned-request', paths: ['a.md'], evidence: 'Owned complete source.' };
    const response = { outputLocale: 'en-US', partitionId: 'wrong-request', files: [{ path: 'a.md', implemented: 'Source.', remaining: 'Unverified.' }] };
    expect(thrown(() => parseProgressPartitionFacts(response, part, 'en-US'))).toMatchObject({ code: 'agent.failed', recovery: {
        id: 'progress-result-contract-invalid', variables: variables('partition', 'partition-id-invalid', '$.partitionId'),
    } });
});
it('captures native schema rejection before application parsing without copying the bad value', async () => {
    const response = result(); response.requirements[1].evidence = 'PRIVATE_MODEL_VALUE';
    const f = adapter(JSON.stringify(response));
    await expect(f.native.query(request)).rejects.toMatchObject({ facts: variables('assessment', 'schema-enum', '$.requirements[1].evidence', 'R2') });
    expect(f.execute).toHaveBeenCalledTimes(1);
});
it('distinguishes completed malformed task JSON from process failure', async () => {
    const f = adapter('PRIVATE_MODEL_TEXT: malformed output');
    await expect(f.native.query(request)).rejects.toMatchObject({ facts: variables('assessment', 'json-invalid', '$') });
});
it('does not reinterpret unrelated execution errors as a completed result', async () => {
    const sentinel = Error('Owned execution failure');
    const f = new FindingsAgentAdapter({ cli: { execute: async () => { throw sentinel; } } });
    await expect(f.query(request)).rejects.toBe(sentinel);
});
