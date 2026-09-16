import { Result } from '../../../data/model/result';
import type { RecommendationState } from '../../../data/model/recommendation_state';
import { createRecommendationFingerprint } from '../../../application/policies/recommendation_policy';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { ApplicationError } from '../../errors/application_error';
import type { RecommendStepsContext, RecommendStepsOutcome } from '../push_single_action_contexts';
import {
    agentOutputLocaleFailureMessage,
    validateAgentOutputLocale,
} from '../../policies/agent_output_locale_policy';
import {
    implementationPlanFingerprintInput,
    parseImplementationPlan,
    type ImplementationPlan,
} from '../../../domain/implementation_plan';

export function buildRecommendationResult(
    param: RecommendStepsContext,
    taskId: string,
    response: string | Record<string, unknown> | undefined,
    issueDescriptionFingerprint: string,
    previousRecommendation: RecommendationState | undefined,
    issueNumber: number,
): RecommendStepsOutcome {
    const extracted = extractImplementationPlan(response, param.targetLocale);
    if (!extracted) {
        return recommendationFailure(taskId, 'The configured agent returned an invalid implementation plan.');
    }
    if (extracted.kind === 'unchanged') {
        if (!previousRecommendation) {
            return recommendationFailure(taskId, 'The configured agent returned unchanged without a previous recommendation.');
        }
        if (previousRecommendation.implementationPlanLocale !== extracted.locale) {
            return recommendationFailure(taskId, 'The configured agent returned unchanged for a plan in a different locale.');
        }
        return skipUnchangedRecommendation(param, previousRecommendation, issueDescriptionFingerprint, 'agent found no material change');
    }
    logDebugInfo(`RecommendSteps: structured agent response received. Step count=${extracted.plan.steps.length}.`);
    const recommendationFingerprint = createRecommendationFingerprint(
        implementationPlanFingerprintInput(extracted.plan),
    );
    if (previousRecommendation?.recommendationFingerprint === recommendationFingerprint
        && previousRecommendation.implementationPlanLocale === extracted.locale) {
        return skipUnchangedRecommendation(param, previousRecommendation, issueDescriptionFingerprint, 'recommendation is unchanged');
    }
    const recommendationState: RecommendationState = Object.freeze({
        issueDescriptionFingerprint,
        recommendationFingerprint,
        implementationPlan: extracted.plan,
        implementationPlanLocale: extracted.locale,
    });
    return recommendationOutcome([new Result({
        id: taskId,
        success: true,
        executed: true,
        payload: {
            issueNumber,
            implementationPlan: extracted.plan,
            recommendationState,
        },
    })]);
}

function skipUnchangedRecommendation(_param: RecommendStepsContext, previous: RecommendationState, fingerprint: string, reason: string): RecommendStepsOutcome {
    logInfo(`RecommendSteps: ${reason}; skipping recommendation comment.`);
    return recommendationOutcome([], { ...previous, issueDescriptionFingerprint: fingerprint });
}

function recommendationOutcome(results: readonly Result[], recommendationState?: RecommendationState): RecommendStepsOutcome {
    return Object.freeze({
        results: Object.freeze([...results]),
        ...(recommendationState ? {
            configurationPatch: Object.freeze({ recommendationState: Object.freeze({ ...recommendationState }) }),
        } : {}),
    });
}

function recommendationFailure(taskId: string, message: string): RecommendStepsOutcome {
    const semanticError = new ApplicationError('agent.failed', message);
    logError(semanticError);
    return recommendationOutcome([
        new Result({ id: taskId, success: false, executed: true, errors: [semanticError] }),
    ]);
}

type ExtractedImplementationPlan =
    | { readonly kind: 'unchanged'; readonly locale: string }
    | { readonly kind: 'recommendation'; readonly locale: string; readonly plan: ImplementationPlan };

function extractImplementationPlan(
    response: string | Record<string, unknown> | undefined,
    targetLocale: string,
): ExtractedImplementationPlan | undefined {
    if (response == null) return undefined;
    const validation = validateAgentOutputLocale(response, targetLocale);
    if (validation.kind === 'invalid') {
        throw new ApplicationError('locale.output-invalid', agentOutputLocaleFailureMessage(validation));
    }
    if (!hasOnlyResponseKeys(validation.payload)) return undefined;
    if (validation.payload.status === 'unchanged') {
        return validation.payload.steps === null && validation.payload.acceptance === null
            ? Object.freeze({ kind: 'unchanged', locale: validation.expectedLocale })
            : undefined;
    }
    if (validation.payload.status !== 'recommendation') return undefined;
    const plan = parseImplementationPlan({
        steps: validation.payload.steps,
        acceptance: validation.payload.acceptance,
    });
    return plan ? Object.freeze({ kind: 'recommendation', locale: validation.expectedLocale, plan }) : undefined;
}

function hasOnlyResponseKeys(payload: Readonly<Record<string, unknown>>): boolean {
    const allowed = ['outputLocale', 'status', 'steps', 'acceptance'];
    return Object.keys(payload).every(key => allowed.includes(key));
}
