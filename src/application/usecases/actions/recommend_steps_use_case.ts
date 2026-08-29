import { isAgentConfigurationReady } from '../../../data/model/agent';
import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RecommendationState } from '../../../data/model/recommendation_state';
import { AGENT_PLAN } from '../../../application/policies/agent_task_policy';
import {
    createIssueDescriptionFingerprint,
    createRecommendationFingerprint,
    getVisibleIssueDescription,
    isNoNewRecommendation,
    limitStoredRecommendation,
} from '../../../application/policies/recommendation_policy';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import { getRecommendStepsPrompt } from '../../../prompts';
import { logDebugInfo, logError, logInfo } from '../../../utils/logger';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../../utils/project_context_instruction';
import { getTaskEmoji } from '../../../utils/task_emoji';
import { ParamUseCase } from '../base/param_usecase';

export class RecommendStepsUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'RecommendStepsUseCase';

    private aiRepository: FindingsQueryPort;

    constructor(
        private readonly issueDescriptionQueryPort: IssueDescriptionQueryPort,
        aiRepository: FindingsQueryPort,
    ) {
        this.aiRepository = aiRepository;
    }

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const results: Result[] = [];

        try {
            if (!isAgentConfigurationReady(param.ai?.getAgentConfiguration('findings'))) {
                results.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        errors: ['Missing agent CLI command and model.'],
                    })
                );
                return results;
            }

            const issueNumber = param.issueNumber;
            if (issueNumber === -1) {
                results.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        errors: ['Issue number not found.'],
                    })
                );
                return results;
            }

            const rawIssueDescription = await this.issueDescriptionQueryPort.getDescription(
                param.owner,
                param.repo,
                issueNumber,
                param.tokens.token
            );
            const issueDescription = rawIssueDescription === undefined
                ? undefined
                : getVisibleIssueDescription(rawIssueDescription);

            if (!issueDescription?.trim()) {
                results.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        errors: [`No description found for issue #${issueNumber}.`],
                    })
                );
                return results;
            }

            const previousRecommendation = param.previousConfiguration?.recommendationState;
            const issueDescriptionFingerprint = createIssueDescriptionFingerprint(issueDescription);
            if (previousRecommendation?.issueDescriptionFingerprint === issueDescriptionFingerprint) {
                logInfo('RecommendSteps: issue description is unchanged; skipping recommendation.');
                return results;
            }

            const prompt = getRecommendStepsPrompt({
                projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
                issueNumber: String(issueNumber),
                issueDescription,
                previousRecommendation: previousRecommendation?.recommendation,
            });

            logDebugInfo(`RecommendSteps: prompt length=${prompt.length}, issue description length=${issueDescription.length}.`);
            logInfo(`🤖 Recommending steps using the configured agent...`);
            const response = await this.aiRepository.query({
                configuration: param.ai?.getAgentConfiguration('findings'),
                agentId: AGENT_PLAN,
                prompt,
            });

            const steps =
                typeof response === 'string'
                    ? response
                    : (response && String((response as Record<string, unknown>).steps)) || 'No response.';

            logDebugInfo(`RecommendSteps: agent response received. Steps length=${steps.length}. Full steps:\n${steps}`);

            if (previousRecommendation && isNoNewRecommendation(steps)) {
                this.updateDescriptionFingerprint(param, previousRecommendation, issueDescriptionFingerprint);
                logInfo('RecommendSteps: agent found no material change; skipping recommendation comment.');
                return results;
            }

            const recommendationFingerprint = createRecommendationFingerprint(steps);
            if (previousRecommendation?.recommendationFingerprint === recommendationFingerprint) {
                this.updateDescriptionFingerprint(param, previousRecommendation, issueDescriptionFingerprint);
                logInfo('RecommendSteps: recommendation is unchanged; skipping recommendation comment.');
                return results;
            }

            const recommendationState: RecommendationState = {
                issueDescriptionFingerprint,
                recommendationFingerprint,
                recommendation: limitStoredRecommendation(steps),
            };

            results.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    stepFormat: 'markdown',
                    steps: ['## Recommended implementation steps', steps],
                    payload: { issueNumber, recommendedSteps: steps, recommendationState },
                })
            );
        } catch (error) {
            logError(`Error in ${this.taskId}: ${error}`);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [`Error in ${this.taskId}: ${error}`],
                })
            );
        }

        return results;
    }

    private updateDescriptionFingerprint(
        param: Execution,
        previousRecommendation: RecommendationState,
        issueDescriptionFingerprint: string,
    ): void {
        param.currentConfiguration.recommendationState = {
            ...previousRecommendation,
            issueDescriptionFingerprint,
        };
    }
}
