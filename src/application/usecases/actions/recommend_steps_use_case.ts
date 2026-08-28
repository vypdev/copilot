import { isAgentConfigurationReady } from '../../../data/model/agent';
import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import { AGENT_PLAN } from '../../../application/policies/agent_task_policy';
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

            const issueDescription = await this.issueDescriptionQueryPort.getDescription(
                param.owner,
                param.repo,
                issueNumber,
                param.tokens.token
            );

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

            const prompt = getRecommendStepsPrompt({
                projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
                issueNumber: String(issueNumber),
                issueDescription,
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

            results.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    steps: ['Recommended steps (configured agent):', steps],
                    payload: { issueNumber, recommendedSteps: steps },
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
}
