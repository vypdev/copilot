import type { FindingsQueryPort, FindingsQueryRequest } from '../../ports/agent_findings_ports';
import type { AgentQueryResult } from '../../ports/agent_query_ports';
import type { ProgressDiffPartition } from '../../ports/progress_diff_query_ports';
import { bindProgressPartitionLength, progressPartitionLengthRejected, progressPartitionRepairPrompt } from '../../policies/progress_partition_length_policy';
import { rethrowProgressQueryFailure } from './query_progress_result_workflow';
import { logInfo } from '../../ports/logging_ports';

/** One replacement per current part; no new source read, publication, or schema relaxation. */
export async function queryProgressPartition(agent: FindingsQueryPort, request: FindingsQueryRequest,
    part: ProgressDiffPartition, limit: number, locale: string): Promise<AgentQueryResult> {
    try { return await agent.query(request); }
    catch (error) {
        const details = bindProgressPartitionLength(error, part, limit, locale);
        if (!details) return rethrowProgressQueryFailure(error, { phase: 'partition' });
        logInfo('A progress file fact exceeded its unchanged response limit. Requesting one replacement for the same complete immutable part; existing progress remains unpublished.');
        try { return await agent.query({ ...request, prompt: progressPartitionRepairPrompt(request.prompt) }); }
        catch (replacementError) {
            const rejected = bindProgressPartitionLength(replacementError, part, limit, locale);
            if (rejected) throw progressPartitionLengthRejected(rejected);
            return rethrowProgressQueryFailure(replacementError, { phase: 'partition' });
        }
    }
}
