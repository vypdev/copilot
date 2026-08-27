/**
 * When a question or help issue is newly opened, posts an initial helpful reply
 * based on the issue description (OpenCode Plan agent). The user can still
 * @mention the bot later for follow-up answers (ThinkUseCase).
 */

import { isAgentConfigurationReady } from '../../../../data/model/agent';
import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import { OPENCODE_AGENT_PLAN } from '../../../../application/policies/agent_task_policy';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import { THINK_RESPONSE_SCHEMA } from '../../../../application/policies/agent_response_schemas';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { getAnswerIssueHelpPrompt } from '../../../../prompts';
import { logDebugInfo, logError, logInfo } from '../../../../utils/logger';
import { OPENCODE_PROJECT_CONTEXT_INSTRUCTION } from '../../../../utils/opencode_project_context_instruction';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { ParamUseCase } from '../../base/param_usecase';
import { extractStructuredAnswer } from '../common/agent_answer_policy';

export class AnswerIssueHelpUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'AnswerIssueHelpUseCase';
    private aiRepository: FindingsQueryPort;
    constructor(
        private readonly issueNotificationPort: IssueNotificationPort,
        aiRepository: FindingsQueryPort,
    ) {
        this.aiRepository = aiRepository;
    }

    async invoke(param: Execution): Promise<Result[]> {
        const results: Result[] = [];

        logInfo('AnswerIssueHelp: checking if initial help reply is needed (AI).');

        try {
            if (!param.issue.opened) {
                results.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                );
                return results;
            }

            if (!param.labels.isQuestion && !param.labels.isHelp) {
                results.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                );
                return results;
            }

            if (!isAgentConfigurationReady(param.ai?.getAgentConfiguration('findings'))) {
                logInfo('OpenCode not configured; skipping initial help reply.');
                results.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                );
                return results;
            }

            const issueNumber = param.issue.number;
            if (issueNumber <= 0) {
                results.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                );
                return results;
            }

            const description = (param.issue.body ?? '').trim();
            if (!description) {
                logInfo('Issue has no body; skipping initial help reply.');
                results.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                );
                return results;
            }

            logInfo(`${getTaskEmoji(this.taskId)} Posting initial help reply for question/help issue #${issueNumber}.`);

            const prompt = getAnswerIssueHelpPrompt({
                description,
                projectContextInstruction: OPENCODE_PROJECT_CONTEXT_INSTRUCTION,
            });

            logDebugInfo(`AnswerIssueHelp: prompt length=${prompt.length}, issue description length=${description.length}. Calling OpenCode Plan agent.`);
            const response = await this.aiRepository.query({
                configuration: param.ai?.getAgentConfiguration('findings'),
                agentId: OPENCODE_AGENT_PLAN,
                prompt,
                options: {
                    expectJson: true,
                    schema: THINK_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
                    schemaName: 'answer_issue_help_response',
                },
            });

            const answer = extractStructuredAnswer(response);

            logDebugInfo(`AnswerIssueHelp: OpenCode response. Answer length=${answer.length}. Full answer:\n${answer}`);

            if (!answer) {
                logError('OpenCode returned no answer for initial help.');
                results.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        errors: ['OpenCode returned no answer for initial help.'],
                    })
                );
                return results;
            }

            await this.issueNotificationPort.addComment(
                param.owner,
                param.repo,
                issueNumber,
                answer,
                param.tokens.token
            );
            logInfo(`Initial help reply posted to issue #${issueNumber}.`);

            results.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
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
