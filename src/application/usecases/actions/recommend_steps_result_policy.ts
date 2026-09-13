import { Result } from '../../../data/model/result';
import type { RecommendationState } from '../../../data/model/recommendation_state';
import { createRecommendationFingerprint, isNoNewRecommendation, limitStoredRecommendation } from '../../../application/policies/recommendation_policy';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { buildCopilotWelcomeMessage } from '../../../application/policies/copilot_interaction_policy';
import { ApplicationError } from '../../errors/application_error';
import type { RecommendStepsContext, RecommendStepsOutcome } from '../push_single_action_contexts';

export function buildRecommendationResult(
    param: RecommendStepsContext,
    taskId: string,
    response: string | Record<string, unknown> | undefined,
    issueDescriptionFingerprint: string,
    previousRecommendation: RecommendationState | undefined,
    issueNumber: number,
): RecommendStepsOutcome {
    const steps = extractRecommendationText(response);
    if (!steps) {
        const semanticError = new ApplicationError('agent.failed', 'The configured agent returned no recommendation.');
        logError(semanticError);
        return recommendationOutcome([new Result({ id: taskId, success: false, executed: true, errors: [semanticError] })]);
    }
    logDebugInfo(`RecommendSteps: agent response received. Steps length=${steps.length}.`);
    if (previousRecommendation && isNoNewRecommendation(steps)) return skipUnchangedRecommendation(param, previousRecommendation, issueDescriptionFingerprint, 'agent found no material change');
    const recommendationFingerprint = createRecommendationFingerprint(steps);
    if (previousRecommendation?.recommendationFingerprint === recommendationFingerprint) return skipUnchangedRecommendation(param, previousRecommendation, issueDescriptionFingerprint, 'recommendation is unchanged');
    const recommendationState: RecommendationState = {
        issueDescriptionFingerprint,
        recommendationFingerprint,
        recommendation: limitStoredRecommendation(steps),
    };
    const stepsWithWelcome = isNewIssue(param)
        ? [buildCopilotWelcomeMessage(param.tokenUser), '## Recommended implementation steps', steps]
        : ['## Recommended implementation steps', steps];
    return recommendationOutcome([new Result({
        id: taskId,
        success: true,
        executed: true,
        stepFormat: 'markdown',
        steps: stepsWithWelcome,
        payload: { issueNumber, recommendedSteps: steps, recommendationState },
    })]);
}

function isNewIssue(param: RecommendStepsContext): boolean {
    return param.eventName === 'issues' && param.eventAction === 'opened';
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

function extractRecommendationText(response: string | Record<string, unknown> | undefined): string {
    if (typeof response === 'string') return response.trim();
    if (!response || typeof response.steps !== 'string') return '';
    return response.steps.trim();
}
