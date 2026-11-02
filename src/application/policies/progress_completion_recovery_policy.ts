import { normalizeProgressCompletionDiagnostic, type ProgressCompletionDiagnostic } from '../../domain/progress_completion_diagnostic';

export const PROGRESS_COMPLETION_HINT_MAX_BYTES = 256;
const PREFIX = '\n\nThe previous completed final response passed response validation except completion equivalence. Reassess the SAME complete immutable evidence and scope. Return one complete response using the unchanged schema. Preserve genuinely missing or uncertain requirements; never force completion from previous statuses or counts. The following numeric data are observations of the rejected model response, not implementation, execution, verification, review or approval evidence.\n[BEGIN_PREVIOUS_MODEL_NUMERIC_FACTS]\n';
const SUFFIX = '\n[END_PREVIOUS_MODEL_NUMERIC_FACTS]';

export function progressCompletionCountsMatchScope(facts: ProgressCompletionDiagnostic, requirementCount: number, uncertainCount: number): boolean {
    const safe = normalizeProgressCompletionDiagnostic(facts);
    return Number.isSafeInteger(requirementCount) && requirementCount >= 1 && requirementCount <= 32
        && Number.isSafeInteger(uncertainCount) && uncertainCount >= 0 && uncertainCount <= requirementCount
        && safe.requirementCount === requirementCount && safe.unknownCount >= uncertainCount;
}

/** Padding accounts for the worst complete envelope; this string must never be queried. */
export function reservedProgressCompletionPrompt(prompt: string): string {
    return prompt + PREFIX + ' '.repeat(PROGRESS_COMPLETION_HINT_MAX_BYTES) + SUFFIX;
}

export function progressCompletionRepairPrompt(prompt: string, facts: ProgressCompletionDiagnostic): string {
    const hint = JSON.stringify(normalizeProgressCompletionDiagnostic(facts));
    // Normalization closes all keys/scalars; their algebraic maximum fits the tested 256-byte reservation.
    return prompt + PREFIX + hint + SUFFIX;
}
