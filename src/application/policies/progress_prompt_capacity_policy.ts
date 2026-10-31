import { AGENT_PROMPT_MAX_BYTES } from '../../domain/agent_execution_plan';
import { buildAgentPrompt, applyAgentEffortInstruction } from './agent_prompt_envelope_policy';
import { productFacingAgentQueryOptions } from './agent_output_locale_policy';
import { progressEvidenceTooLarge } from './progress_diff_partition_policy';
import { MAX_PROGRESS_AGGREGATE_BYTES } from './progress_partition_response_policy';

export const PROGRESS_PROMPT_FRAMING_RESERVE_BYTES = 1_024;

type Task = Parameters<typeof productFacingAgentQueryOptions>[0];
type Schema = Parameters<typeof productFacingAgentQueryOptions>[1];

/** Counts exactly the security/schema/task envelope used by the native adapter. */
export function remainingProgressPromptBytes(prompt: string, task: Task, schema: Schema, effort?: string): number {
    const options = productFacingAgentQueryOptions(task, schema);
    const remaining = AGENT_PROMPT_MAX_BYTES - Buffer.byteLength(applyAgentEffortInstruction(buildAgentPrompt(prompt, true, options.schema, options.schemaName), effort));
    if (remaining < 0) throw progressEvidenceTooLarge();
    return remaining;
}

/** Dynamic untrusted-data framing is reserved before the first model request. */
export function progressAggregateBudget(promptWithoutEvidence: string, schema: Schema, effort?: string): number {
    const budget = Math.min(MAX_PROGRESS_AGGREGATE_BYTES, remainingProgressPromptBytes(promptWithoutEvidence, 'progress', schema, effort) - PROGRESS_PROMPT_FRAMING_RESERVE_BYTES);
    if (budget < 1) throw progressEvidenceTooLarge();
    return budget;
}
