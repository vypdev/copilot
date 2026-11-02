import type { FindingsQueryPort, FindingsQueryRequest } from '../../ports/agent_findings_ports';
import { ApplicationError } from '../../errors/application_error';
import { ProgressCompletionMismatch } from '../../errors/progress_completion_mismatch';
import { progressCompletionCountsMatchScope, progressCompletionRepairPrompt } from '../../policies/progress_completion_recovery_policy';
import { remainingProgressAssessmentPromptBytes } from '../../policies/progress_prompt_capacity_policy';
import type { ProgressScope, ProgressScopeAnchors } from '../../policies/progress_scope_policy';
import type { ProgressCompletionDiagnostic } from '../../../domain/progress_completion_diagnostic';
import { logInfo } from '../../ports/logging_ports';
import { parseProgressResponse, type ProgressAttemptResult } from './progress_response';
import { queryProgressResult } from './query_progress_result_workflow';

interface AssessmentContext {
    readonly scope: ProgressScope;
    readonly anchors: ProgressScopeAnchors;
    readonly targetLocale: string;
    readonly sourceLineIds: readonly string[];
}
type Outcome = { readonly kind: 'valid'; readonly result: ProgressAttemptResult }
    | { readonly kind: 'mismatch'; readonly facts: ProgressCompletionDiagnostic; readonly correlationId: string };

function freezeSnapshot<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(freezeSnapshot);
    }
    return value;
}

/** Query failures never enter the parse-only catch; rejected prose stays inside this ended call. */
async function evaluate(agent: FindingsQueryPort, request: FindingsQueryRequest, context: AssessmentContext): Promise<Outcome> {
    const response = await queryProgressResult(agent, request, { phase: 'assessment',
        requirementIds: context.scope.requirements.map(requirement => requirement.id),
        sourceLineIds: context.sourceLineIds, anchors: context.anchors });
    try { return { kind: 'valid', result: parseProgressResponse(response, context.targetLocale, context.scope, context.anchors) }; }
    catch (error) {
        if (!(error instanceof ProgressCompletionMismatch)) throw error;
        const facts = error.factsFor(context.scope);
        if (!facts || !progressCompletionCountsMatchScope(facts, context.scope.requirements.length,
            context.scope.requirements.filter(requirement => requirement.uncertain).length)) throw error;
        return { kind: 'mismatch', facts, correlationId: error.correlationId };
    }
}

/** One complete read-only replacement; this owner has no publication capability. */
export async function queryProgressAssessment(agent: FindingsQueryPort, request: FindingsQueryRequest,
    context: AssessmentContext): Promise<ProgressAttemptResult> {
    const captured = freezeSnapshot(globalThis.structuredClone({ request, context }));
    if (!captured.request.options?.schema || captured.request.options.expectJson !== true) {
        throw new ApplicationError('configuration.unsupported', 'Final progress assessment requires its complete response schema. Existing progress was retained.');
    }
    remainingProgressAssessmentPromptBytes(captured.request.prompt, captured.request.options.schema, captured.request.configuration?.effort);
    const first = await evaluate(agent, captured.request, captured.context);
    if (first.kind === 'valid') return first.result;
    logInfo('Reassessing one inconsistent completed progress estimate using the same complete pinned evidence. Previous progress is retained.');
    const replacement = { ...captured.request, prompt: progressCompletionRepairPrompt(captured.request.prompt, first.facts) };
    const second = await evaluate(agent, replacement, captured.context);
    if (second.kind === 'valid') return second.result;
    throw new ApplicationError('agent.failed', 'Progress completion remained inconsistent after one complete reassessment. Existing progress was retained.',
        { correlationId: second.correlationId, recovery: { id: 'progress-completion-recovery-exhausted', variables: second.facts } });
}
