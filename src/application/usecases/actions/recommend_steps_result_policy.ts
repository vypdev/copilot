import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RecommendationState } from '../../../data/model/recommendation_state';
import { createRecommendationFingerprint, isNoNewRecommendation, limitStoredRecommendation } from '../../../application/policies/recommendation_policy';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';

export function buildRecommendationResult(
    param: Execution,
    taskId: string,
    response: string | Record<string, unknown> | undefined,
    issueDescriptionFingerprint: string,
    previousRecommendation: RecommendationState | undefined,
    issueNumber: number,
): Result[] {
    const steps = extractRecommendationText(response);
    if (!steps) {
        const error = new Error('The configured agent returned no recommendation.');
        logError(error);
        return [new Result({ id: taskId, success: false, executed: true, errors: [error] })];
    }
    logDebugInfo(`RecommendSteps: agent response received. Steps length=${steps.length}. Full steps:\n${steps}`);
    if (previousRecommendation && isNoNewRecommendation(steps)) return skipUnchangedRecommendation(param, previousRecommendation, issueDescriptionFingerprint, 'agent found no material change');
    const recommendationFingerprint = createRecommendationFingerprint(steps);
    if (previousRecommendation?.recommendationFingerprint === recommendationFingerprint) return skipUnchangedRecommendation(param, previousRecommendation, issueDescriptionFingerprint, 'recommendation is unchanged');
    const recommendationState: RecommendationState = {
        issueDescriptionFingerprint,
        recommendationFingerprint,
        recommendation: limitStoredRecommendation(steps),
    };
    return [new Result({
        id: taskId,
        success: true,
        executed: true,
        stepFormat: 'markdown',
        steps: ['## Recommended implementation steps', steps],
        payload: { issueNumber, recommendedSteps: steps, recommendationState },
    })];
}

function skipUnchangedRecommendation(param: Execution, previous: RecommendationState, fingerprint: string, reason: string): Result[] {
    param.currentConfiguration.recommendationState = { ...previous, issueDescriptionFingerprint: fingerprint };
    logInfo(`RecommendSteps: ${reason}; skipping recommendation comment.`);
    return [];
}

function extractRecommendationText(response: string | Record<string, unknown> | undefined): string {
    if (typeof response === 'string') return response.trim();
    if (!response || typeof response.steps !== 'string') return '';
    return response.steps.trim();
}
