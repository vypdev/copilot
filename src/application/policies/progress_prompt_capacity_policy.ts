import { AGENT_PROMPT_MAX_BYTES } from '../../domain/agent_execution_plan';
import { buildAgentPrompt, applyAgentEffortInstruction } from './agent_prompt_envelope_policy';
import { productFacingAgentQueryOptions } from './agent_output_locale_policy';
import { progressEvidenceTooLarge } from './progress_diff_partition_policy';
import { MAX_PROGRESS_AGGREGATE_BYTES } from './progress_partition_response_policy';
import { reservedProgressCompletionPrompt } from './progress_completion_recovery_policy';
import type { ProgressCapacityPhase } from '../../domain/progress_capacity_diagnostic';

export const PROGRESS_PROMPT_FRAMING_RESERVE_BYTES = 1_024;

type Task = 'progress-scope' | 'progress-partition' | 'progress';
type Schema = Parameters<typeof productFacingAgentQueryOptions>[1];

/** Counts exactly the security/schema/task envelope used by the native adapter. */
export function remainingProgressPromptBytes(prompt: string, task: Task, schema: Schema, effort?: string,
    dimension: 'native-prompt-bytes' | 'native-prompt-reserve-bytes' = 'native-prompt-bytes'): number {
    const options = productFacingAgentQueryOptions(task, schema);
    const observedCount = Buffer.byteLength(applyAgentEffortInstruction(buildAgentPrompt(prompt, true, options.schema, options.schemaName), effort), 'utf8');
    const phase: ProgressCapacityPhase = task === 'progress-scope' ? 'scope' : task === 'progress-partition' ? 'partition' : 'assessment';
    if (observedCount > AGENT_PROMPT_MAX_BYTES) throw progressEvidenceTooLarge({ phase, dimension, observedCount, supportedLimit: AGENT_PROMPT_MAX_BYTES });
    return AGENT_PROMPT_MAX_BYTES - observedCount;
}

/** Dynamic untrusted-data framing is reserved before the first model request. */
export function progressAggregateBudget(promptWithoutEvidence: string, schema: Schema, effort?: string): number {
    const available = remainingProgressAssessmentPromptBytes(promptWithoutEvidence, schema, effort);
    const budget = Math.min(MAX_PROGRESS_AGGREGATE_BYTES, available - PROGRESS_PROMPT_FRAMING_RESERVE_BYTES);
    if (budget < 1) throw progressEvidenceTooLarge({ phase: 'aggregate', dimension: 'aggregate-reserve-bytes',
        observedCount: PROGRESS_PROMPT_FRAMING_RESERVE_BYTES + 1, supportedLimit: available });
    return budget;
}

/** Both original and worst complete final replacement fit before any scope request is admitted. */
export function remainingProgressAssessmentPromptBytes(prompt: string, schema: Schema, effort?: string): number {
    remainingProgressPromptBytes(prompt, 'progress', schema, effort);
    return remainingProgressPromptBytes(reservedProgressCompletionPrompt(prompt), 'progress', schema, effort, 'native-prompt-reserve-bytes');
}
