import { isAgentConfigurationReady } from '../../../data/model/agent';
import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import { AGENT_PLAN } from '../../../application/policies/agent_task_policy';
import {
    createIssueDescriptionFingerprint,
    getVisibleIssueDescription,
} from '../../../application/policies/recommendation_policy';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import { getRecommendStepsPrompt } from '../../../prompts';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../../utils/project_context_instruction';
import { getTaskEmoji } from '../../../utils/task_emoji';
import { buildRecommendationResult } from './recommend_steps_result_policy';
import { ApplicationError, toApplicationError } from '../../errors/application_error';

export interface RecommendStepsWorkflowDependencies {
    issueDescriptionQueryPort: IssueDescriptionQueryPort;
    aiRepository: FindingsQueryPort;
}

/** Runs the recommendation policy and agent interaction for an issue. */
export async function runRecommendStepsWorkflow(
    param: Execution,
    taskId: string,
    dependencies: RecommendStepsWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(taskId)} Executing ${taskId}.`);

    try {
        const configuration = param.ai.getAgentConfiguration('planner');
        if (!isAgentConfigurationReady(configuration)) {
            return [failure(taskId, 'Missing agent model or executable.', 'configuration.invalid')];
        }

        const issueNumber = param.issueNumber;
        if (issueNumber === -1) {
            return [failure(taskId, 'Issue number not found.', 'validation.invalid-input')];
        }

        const rawIssueDescription = await dependencies.issueDescriptionQueryPort.getDescription(
            param.owner,
            param.repo,
            issueNumber,
            param.tokens.token,
        );
        const issueDescription = rawIssueDescription === undefined
            ? undefined
            : getVisibleIssueDescription(rawIssueDescription);

        if (!issueDescription?.trim()) {
            return [failure(taskId, `No description found for issue #${issueNumber}.`, 'provider.not-found')];
        }

        const previousRecommendation = param.previousConfiguration?.recommendationState;
        const issueDescriptionFingerprint = createIssueDescriptionFingerprint(issueDescription);
        if (previousRecommendation?.issueDescriptionFingerprint === issueDescriptionFingerprint) {
            logInfo('RecommendSteps: issue description is unchanged; skipping recommendation.');
            return [];
        }

        const prompt = getRecommendStepsPrompt({
            projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
            issueNumber: String(issueNumber),
            issueDescription,
            previousRecommendation: previousRecommendation?.recommendation,
        });
        logDebugInfo(
            `RecommendSteps: prompt length=${prompt.length}, issue description length=${issueDescription.length}.`,
        );
        logInfo('🤖 Recommending steps using the configured agent...');

        const response = await dependencies.aiRepository.query({
            configuration,
            agentId: AGENT_PLAN,
            prompt,
        });
        return buildRecommendationResult(param, taskId, response, issueDescriptionFingerprint, previousRecommendation, issueNumber);
    } catch (error) {
        const semanticError = toApplicationError(error, 'agent.failed', `Unable to complete ${taskId}.`);
        logError(semanticError);
        return [
            new Result({
                id: taskId,
                success: false,
                executed: true,
                errors: [semanticError],
            }),
        ];
    }
}

function failure(taskId: string, message: string, code: ConstructorParameters<typeof ApplicationError>[0]): Result {
    return new Result({
        id: taskId,
        success: false,
        executed: true,
        errors: [new ApplicationError(code, message)],
    });
}
