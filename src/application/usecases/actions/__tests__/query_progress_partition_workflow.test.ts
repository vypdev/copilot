import { queryProgressPartition } from '../query_progress_partition_workflow';
import { progressPartitionResponseSchema } from '../../../policies/progress_partition_response_policy';
import { productFacingAgentQueryOptions } from '../../../policies/agent_output_locale_policy';
import { progressPartitionRepairPrompt } from '../../../policies/progress_partition_length_policy';
import { interpretProgressAgentOutput } from '../../../../data/repository/progress_agent_response_policy';
import { ApplicationError } from '../../../errors/application_error';
import { ProgressResponseContractFailure } from '../../../../domain/progress_response_diagnostic';
import * as logging from '../../../ports/logging_ports';

const part = { id: 'part-1', paths: ['a.ts'], evidence: 'Complete immutable source.' };
const schema = progressPartitionResponseSchema(part), request = { agentId: 'plan', prompt: 'Complete immutable source.',
    configuration: { provider: 'codex' as const, model: 'fixture-model', effort: 'low' }, options: { ...productFacingAgentQueryOptions('progress-partition', schema), includeReasoning: false } };
const value = { outputLocale: 'en-US', partitionId: part.id, files: [{ path: 'a.ts', implemented: 'PRIVATE_RESPONSE_'.repeat(50), remaining: 'Unknown.' }] };
function overflow() {
    try { interpretProgressAgentOutput(JSON.stringify(value), 'partition', schema); } catch (error) { return error; }
    throw Error('Expected typed output rejection');
}
const call = (query: jest.Mock) => queryProgressPartition({ query }, request, part, 600, 'en-US');
it.each(['provider.unavailable', 'workflow.cancelled'] as const)('does not replace an initial %s failure', async code => {
    const failure = new ApplicationError(code, 'Owned execution failure'), query = jest.fn().mockRejectedValue(failure);
    await expect(call(query)).rejects.toBe(failure); expect(query).toHaveBeenCalledTimes(1);
});
it.each(['provider.unavailable', 'workflow.cancelled'] as const)('retains replacement %s classification without a third call', async code => {
    const failure = new ApplicationError(code, 'Owned execution failure'), query = jest.fn().mockRejectedValueOnce(overflow()).mockRejectedValue(failure);
    await expect(call(query)).rejects.toBe(failure); expect(query).toHaveBeenCalledTimes(2);
});
it('changes only the fixed prompt suffix while preserving configuration, exact schema and other query options', async () => {
    const valid = { ...value, files: [{ path: 'a.ts', implemented: 'Source.', remaining: 'Unverified.' }] };
    const query = jest.fn().mockRejectedValueOnce(overflow()).mockResolvedValue(valid);
    await expect(call(query)).resolves.toBe(valid);
    expect(query.mock.calls[0][0]).toBe(request); expect(query.mock.calls[1][0]).toEqual({ ...request, prompt: progressPartitionRepairPrompt(request.prompt) });
    expect(request.prompt).toBe('Complete immutable source.');
});
it('keeps a second unrelated schema rejection separate from an exhausted length repair', async () => {
    const failure = new ProgressResponseContractFailure({ phase: 'partition', reason: 'partition-files-incomplete', field: '$.files', requirementId: 'none', sourceLineId: 'none' });
    const query = jest.fn().mockRejectedValueOnce(overflow()).mockRejectedValueOnce(failure);
    await expect(call(query)).rejects.toMatchObject({ recovery: { id: 'progress-result-contract-invalid', variables: { reason: 'partition-files-incomplete' } } });
    expect(query).toHaveBeenCalledTimes(2);
});
it('logs a fixed recovery state without any captured error or returned source text', async () => {
    const log = jest.spyOn(logging, 'logInfo').mockImplementation(() => undefined);
    try {
        const path = 'src/@all<script>`\u202e.ts', scoped = { ...part, paths: [path] }, localSchema = progressPartitionResponseSchema(scoped);
        let rejected: unknown;
        try { interpretProgressAgentOutput(JSON.stringify({ ...value, files: [{ ...value.files[0], path }] }), 'partition', localSchema); } catch (error) { rejected = error; }
        const query = jest.fn().mockRejectedValueOnce(rejected).mockResolvedValue({});
        await queryProgressPartition({ query }, { ...request, options: productFacingAgentQueryOptions('progress-partition', localSchema) }, scoped, 600, 'en-US');
        const line = log.mock.calls.map(([message]) => message).join('');
        expect(line).toBe('A progress file fact exceeded its unchanged response limit. Requesting one replacement for the same complete immutable part; existing progress remains unpublished.');
        expect(line).not.toMatch(/PRIVATE_RESPONSE_|@all|<script>|\u202e/u);
    } finally { log.mockRestore(); }
});
