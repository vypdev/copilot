import type { FindingsQueryPort, FindingsQueryRequest } from '../../ports/agent_findings_ports';
import { ApplicationError } from '../../errors/application_error';
import { ProgressCompletionMismatch } from '../../errors/progress_completion_mismatch';
import { progressCompletionCountsMatchScope, progressCompletionRepairPrompt } from '../../policies/progress_completion_recovery_policy';
import { remainingProgressAssessmentPromptBytes } from '../../policies/progress_prompt_capacity_policy';
import type { ProgressScope, ProgressScopeAnchors } from '../../policies/progress_scope_policy';
import type { ProgressCompletionDiagnostic } from '../../../domain/progress_completion_diagnostic';
import type { ProgressAssessmentLengthDiagnostic } from '../../../domain/progress_assessment_length_failure';
import type { AgentQueryResult } from '../../ports/agent_query_ports';
import { bindProgressAssessmentLength, progressAssessmentLengthRepairPrompt, progressAssessmentLengthRejected } from '../../policies/progress_assessment_length_policy';
import { logInfo } from '../../ports/logging_ports';
import { parseProgressResponse, type ProgressAttemptResult } from './progress_response';
import { rethrowProgressQueryFailure } from './query_progress_result_workflow';
import { compactProgressAssessmentPlan, compactProgressAssessmentPrompt, decodeCompactProgressAssessment,
    type CompactProgressAssessmentPlan } from '../../policies/progress_compact_assessment_policy';

interface AssessmentContext {
    readonly scope: ProgressScope;
    readonly anchors: ProgressScopeAnchors;
    readonly targetLocale: string;
    readonly sourceLineIds: readonly string[];
    readonly preferCompactFacts?: boolean;
}
type Outcome = { readonly kind: 'valid'; readonly result: ProgressAttemptResult }
    | { readonly kind: 'length'; readonly facts: ProgressAssessmentLengthDiagnostic }
    | { readonly kind: 'mismatch'; readonly facts: ProgressCompletionDiagnostic; readonly correlationId: string };

function freezeSnapshot<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(freezeSnapshot);
    }
    return value;
}

/** Only attributable native length failures enter recovery; completion still has a parse-only catch. */
async function evaluate(agent: FindingsQueryPort, request: FindingsQueryRequest, context: AssessmentContext,
    projectResponse: (response: AgentQueryResult) => AgentQueryResult, compact?: CompactProgressAssessmentPlan): Promise<Outcome> {
    let response: AgentQueryResult;
    try { response = await agent.query(request); }
    catch (error) {
        const facts = bindProgressAssessmentLength(error, request.options?.schema, context.scope, context.anchors, context.sourceLineIds, context.targetLocale);
        if (facts) return { kind: 'length', facts };
        return rethrowProgressQueryFailure(error, { phase: 'assessment', requirementIds: context.scope.requirements.map(requirement => requirement.id),
            sourceLineIds: context.sourceLineIds, anchors: context.anchors });
    }
    try {
        const canonical = compact ? decodeCompactProgressAssessment(response, compact, context.scope, context.anchors) : response;
        return { kind: 'valid', result: parseProgressResponse(projectResponse(canonical), context.targetLocale, context.scope, context.anchors) };
    }
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
    context: AssessmentContext, projectResponse: (response: AgentQueryResult) => AgentQueryResult = response => response): Promise<ProgressAttemptResult> {
    const captured = freezeSnapshot(globalThis.structuredClone({ request, context }));
    if (!captured.request.options?.schema || captured.request.options.expectJson !== true) {
        throw new ApplicationError('configuration.unsupported', 'Final progress assessment requires its complete response schema. Existing progress was retained.');
    }
    remainingProgressAssessmentPromptBytes(captured.request.prompt, captured.request.options.schema, captured.request.configuration?.effort);
    const compact = freezeSnapshot(compactProgressAssessmentPlan(captured.request.options.schema, captured.context.targetLocale));
    const initialCompact = captured.context.preferCompactFacts ? compact : undefined;
    const compactRequest = (plan: CompactProgressAssessmentPlan, facts?: ProgressAssessmentLengthDiagnostic | ProgressCompletionDiagnostic): FindingsQueryRequest => freezeSnapshot({
        ...captured.request, prompt: compactProgressAssessmentPrompt(captured.request.prompt, facts),
        options: { ...captured.request.options, schema: plan.schema },
    });
    const first = await evaluate(agent, initialCompact ? compactRequest(initialCompact) : captured.request, captured.context, projectResponse, initialCompact);
    if (first.kind === 'valid') return first.result;
    logInfo(first.kind === 'length'
        ? 'A progress acceptance fact exceeded its unchanged response limit. Requesting one complete replacement for the same pinned batch; previous progress is retained.'
        : 'Reassessing one inconsistent completed progress estimate using the same complete pinned evidence. Previous progress is retained.');
    const replacementCompact = initialCompact ?? (first.kind === 'length' ? compact : undefined);
    const replacement = replacementCompact ? compactRequest(replacementCompact, first.facts) : { ...captured.request, prompt: first.kind === 'length'
        ? progressAssessmentLengthRepairPrompt(captured.request.prompt, first.facts)
        : progressCompletionRepairPrompt(captured.request.prompt, first.facts) };
    const second = await evaluate(agent, replacement, captured.context, projectResponse, replacementCompact);
    if (second.kind === 'valid') return second.result;
    if (second.kind === 'length') throw progressAssessmentLengthRejected(second.facts);
    throw new ApplicationError('agent.failed', 'Progress completion remained inconsistent after one complete reassessment. Existing progress was retained.',
        { correlationId: second.correlationId, recovery: { id: 'progress-completion-recovery-exhausted', variables: second.facts } });
}
