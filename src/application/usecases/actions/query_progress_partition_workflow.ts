import { assertProgressPartitionByteLimit, verifyProgressPartitionBytes, bindProgressPartitionBytes, progressPartitionBytesRejected } from '../../policies/progress_partition_byte_policy';
import type { FindingsQueryPort, FindingsQueryRequest } from '../../ports/agent_findings_ports';
import type { AgentQueryResult } from '../../ports/agent_query_ports';
import type { ProgressDiffPartition } from '../../ports/progress_diff_query_ports';
import { bindProgressPartitionLength, progressPartitionLengthRejected, progressPartitionRepairPrompt } from '../../policies/progress_partition_length_policy';
import { rethrowProgressQueryFailure } from './query_progress_result_workflow';
import { logInfo } from '../../ports/logging_ports';

function freezeSnapshot<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value); Object.values(value).forEach(freezeSnapshot);
    }
    return value;
}

/** One replacement per current part; no new source read, publication, or schema relaxation. */
export async function queryProgressPartition(agent: FindingsQueryPort, request: FindingsQueryRequest,
    part: ProgressDiffPartition, limit: number, locale: string, factJsonBytes?: number): Promise<AgentQueryResult> {
    assertProgressPartitionByteLimit(factJsonBytes);
    const { signal, ...data } = request;
    const captured = freezeSnapshot(globalThis.structuredClone({ request: data, part }));
    const initial = Object.freeze({ ...captured.request, ...(signal === undefined ? {} : { signal }) });
    const query = async (current: FindingsQueryRequest) => {
        const response = await agent.query(current);
        verifyProgressPartitionBytes(response, captured.part, limit, locale, factJsonBytes);
        return response;
    };
    try { return await query(initial); }
    catch (error) {
        const details = bindProgressPartitionLength(error, captured.part, limit, locale);
        if (!details && !bindProgressPartitionBytes(error, captured.part, factJsonBytes, locale)) return rethrowProgressQueryFailure(error, { phase: 'partition' });
        logInfo('A progress file fact exceeded its unchanged response limit. Requesting one replacement for the same complete immutable part; existing progress remains unpublished.');
        try { return await query({ ...initial, prompt: progressPartitionRepairPrompt(initial.prompt) }); }
        catch (replacementError) {
            const rejected = bindProgressPartitionLength(replacementError, captured.part, limit, locale);
            if (rejected) throw progressPartitionLengthRejected(rejected);
            const bytes = bindProgressPartitionBytes(replacementError, captured.part, factJsonBytes, locale);
            if (bytes) throw progressPartitionBytesRejected(bytes);
            return rethrowProgressQueryFailure(replacementError, { phase: 'partition' });
        }
    }
}
