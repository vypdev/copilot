import { isAgentConfigurationReady } from '../../../data/model/agent';
import { Result } from '../../../data/model/result';
import { AGENT_PLAN } from '../../../application/policies/agent_task_policy';
import {
    createIssueDescriptionFingerprint,
    getVisibleIssueDescription,
} from '../../../application/policies/recommendation_policy';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { BoundIssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import type { RecommendStepsContext, RecommendStepsOutcome } from '../push_single_action_contexts';
import { getRecommendStepsPrompt } from '../../../prompts';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../../utils/project_context_instruction';
import { getTaskEmoji } from '../../../utils/task_emoji';
import { buildRecommendationResult } from './recommend_steps_result_policy';
import { ApplicationError, toApplicationError } from '../../errors/application_error';
import { RECOMMEND_STEPS_RESPONSE_SCHEMA } from '../../policies/agent_response_schemas';
import { productFacingAgentQueryOptions } from '../../policies/agent_output_locale_policy';
import { implementationPlanFingerprintInput } from '../../../domain/implementation_plan';

export interface RecommendStepsWorkflowDependencies {
    issueDescriptionQueryPort: BoundIssueDescriptionQueryPort;
    aiRepository: FindingsQueryPort;
}

/** Runs the recommendation policy and agent interaction for an issue. */
export async function runRecommendStepsWorkflow(
    param: RecommendStepsContext,
    taskId: string,
    dependencies: RecommendStepsWorkflowDependencies,
): Promise<RecommendStepsOutcome> {
    logInfo(`${getTaskEmoji(taskId)} Executing ${taskId}.`);

    try {
        const configuration = param.agentConfiguration;
        const previousRecommendation = param.previousRecommendation;
        const agentReady = isAgentConfigurationReady(configuration);
        if (!agentReady && !previousRecommendation) {
            return outcome([failure(taskId, 'Missing agent model or executable.', 'configuration.invalid')]);
        }

        const issueNumber = param.issueNumber;
        if (issueNumber === -1) {
            return outcome([failure(taskId, 'Issue number not found.', 'validation.invalid-input')]);
        }

        const rawIssueDescription = await dependencies.issueDescriptionQueryPort.getDescription(
            issueNumber,
        );
        const issueDescription = rawIssueDescription === undefined
            ? undefined
            : getVisibleIssueDescription(rawIssueDescription);

        if (!issueDescription?.trim()) {
            return outcome([failure(taskId, `No description found for issue #${issueNumber}.`, 'provider.not-found')]);
        }

        const issueDescriptionFingerprint = createIssueDescriptionFingerprint(issueDescription);
        const matchingPreviousRecommendation = previousRecommendation?.issueDescriptionFingerprint === issueDescriptionFingerprint;
        const structuredPlanUsesTargetLocale = previousRecommendation?.implementationPlanLocale === param.targetLocale;
        if (matchingPreviousRecommendation && structuredPlanUsesTargetLocale) {
            logInfo('RecommendSteps: issue description is unchanged; reconciling the existing plan.');
            return replayExistingPlan(taskId, issueNumber, previousRecommendation);
        }
        if (matchingPreviousRecommendation) {
            logInfo('RecommendSteps: regenerating the matching structured plan in the configured issue locale.');
        }
        if (!agentReady) {
            return outcome([failure(taskId, 'Missing agent model or executable.', 'configuration.invalid')]);
        }

        const prompt = getRecommendStepsPrompt({
            projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
            issueNumber: String(issueNumber),
            issueDescription,
            previousRecommendation: previousRecommendation
                ? implementationPlanFingerprintInput(previousRecommendation.implementationPlan)
                : undefined,
            previousRecommendationFormat: structuredPlanUsesTargetLocale
                ? 'structured'
                : 'structured-other-locale',
            targetLocale: param.targetLocale,
        });
        logDebugInfo(
            `RecommendSteps: prompt length=${prompt.length}, issue description length=${issueDescription.length}.`,
        );
        logInfo('🤖 Recommending steps using the configured agent...');

        const response = await dependencies.aiRepository.query({
            configuration,
            agentId: AGENT_PLAN,
            prompt,
            options: productFacingAgentQueryOptions('recommend-steps', RECOMMEND_STEPS_RESPONSE_SCHEMA),
        });
        return buildRecommendationResult(param, taskId, response, issueDescriptionFingerprint, previousRecommendation, issueNumber);
    } catch (error) {
        const semanticError = toApplicationError(error, 'agent.failed', `Unable to complete ${taskId}.`);
        logError(semanticError);
        return outcome([
            new Result({
                id: taskId,
                success: false,
                executed: true,
                errors: [semanticError],
            }),
        ]);
    }
}

function replayExistingPlan(
    taskId: string,
    issueNumber: number,
    recommendationState: Readonly<NonNullable<RecommendStepsContext['previousRecommendation']>>,
): RecommendStepsOutcome {
    return outcome([new Result({
        id: taskId,
        success: true,
        executed: true,
        payload: Object.freeze({
            issueNumber,
            implementationPlan: recommendationState.implementationPlan,
            recommendationState: Object.freeze({ ...recommendationState }),
        }),
    })]);
}

function outcome(results: readonly Result[]): RecommendStepsOutcome {
    return Object.freeze({ results: Object.freeze([...results]) });
}

function failure(taskId: string, message: string, code: ConstructorParameters<typeof ApplicationError>[0]): Result {
    return new Result({
        id: taskId,
        success: false,
        executed: true,
        errors: [new ApplicationError(code, message)],
    });
}
