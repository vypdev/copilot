import { Result } from '../../../data/model/result';
import type { RecommendationState } from '../../../data/model/recommendation_state';
import { createRecommendationFingerprint, isNoNewRecommendation, limitStoredRecommendation, NO_NEW_RECOMMENDATIONS } from '../../../application/policies/recommendation_policy';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { ApplicationError } from '../../errors/application_error';
import type { RecommendStepsContext, RecommendStepsOutcome } from '../push_single_action_contexts';
import {
    agentOutputLocaleFailureMessage,
    validateAgentOutputLocale,
} from '../../policies/agent_output_locale_policy';

export function buildRecommendationResult(
    param: RecommendStepsContext,
    taskId: string,
    response: string | Record<string, unknown> | undefined,
    issueDescriptionFingerprint: string,
    previousRecommendation: RecommendationState | undefined,
    issueNumber: number,
): RecommendStepsOutcome {
    const steps = extractRecommendationText(response, param.targetLocale);
    if (!steps) {
        return recommendationFailure(taskId, 'The configured agent returned no recommendation.');
    }
    logDebugInfo(`RecommendSteps: agent response received. Steps length=${steps.length}.`);
    if (isNoNewRecommendation(steps)) {
        return previousRecommendation
            ? skipUnchangedRecommendation(param, previousRecommendation, issueDescriptionFingerprint, 'agent found no material change')
            : recommendationFailure(taskId, 'The configured agent returned unchanged without a previous recommendation.');
    }
    const recommendationFingerprint = createRecommendationFingerprint(steps);
    if (previousRecommendation?.recommendationFingerprint === recommendationFingerprint) return skipUnchangedRecommendation(param, previousRecommendation, issueDescriptionFingerprint, 'recommendation is unchanged');
    const recommendationState: RecommendationState = {
        issueDescriptionFingerprint,
        recommendationFingerprint,
        recommendation: limitStoredRecommendation(steps),
    };
    return recommendationOutcome([new Result({
        id: taskId,
        success: true,
        executed: true,
        payload: { issueNumber, recommendedSteps: steps, recommendationState },
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

function extractRecommendationText(response: string | Record<string, unknown> | undefined, targetLocale: string): string {
    if (response == null) return '';
    const validation = validateAgentOutputLocale(response, targetLocale);
    if (validation.kind === 'invalid') {
        throw new ApplicationError('locale.output-invalid', agentOutputLocaleFailureMessage(validation));
    }
    if (validation.payload.status === 'unchanged') return NO_NEW_RECOMMENDATIONS;
    return typeof validation.payload.steps === 'string' ? validation.payload.steps.trim() : '';
}
