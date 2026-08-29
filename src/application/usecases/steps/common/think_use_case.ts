import { isAgentConfigurationReady } from '../../../../data/model/agent';
import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import { AGENT_PLAN } from '../../../../application/policies/agent_task_policy';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import { THINK_RESPONSE_SCHEMA } from '../../../../application/policies/agent_response_schemas';
import type { IssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { getThinkPrompt } from '../../../../prompts';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../../../utils/project_context_instruction';
import { ParamUseCase } from '../../base/param_usecase';
import { extractStructuredAnswer } from './agent_answer_policy';
import { extractMentionQuestion, getThinkCommentBody } from './think_input_policy';

export class ThinkUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'ThinkUseCase';
    private aiRepository: FindingsQueryPort;
    constructor(
        private readonly issueDescriptionQueryPort: IssueDescriptionQueryPort,
        private readonly issueNotificationPort: IssueNotificationPort,
        aiRepository: FindingsQueryPort,
    ) {
        this.aiRepository = aiRepository;
    }

    async invoke(param: Execution): Promise<Result[]> {
        const results: Result[] = [];

        logInfo('Think: processing comment (AI Q&A).');

        try {
            const commentBody = getThinkCommentBody({
                issueCommentBody: param.issue.commentBody,
                pullRequestReviewCommentBody: param.pullRequest.commentBody,
                isIssueComment: param.issue.isIssueComment,
                isPullRequestReviewComment: param.pullRequest.isPullRequestReviewComment,
            });

            if (!commentBody.trim()) {
                results.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                );
                return results;
            }

            if (!param.tokenUser?.trim()) {
                logInfo('Bot username (tokenUser) not set; skipping Think response.');
                results.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                );
                return results;
            }

            if (!commentBody.includes(`@${param.tokenUser}`)) {
                logInfo(`Comment does not mention @${param.tokenUser}; skipping.`);
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
                results.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: false,
                        errors: ['Configured agent model or CLI command not found.'],
                    })
                );
                return results;
            }

            const question = extractMentionQuestion(commentBody, param.tokenUser);
            if (!question) {
                results.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: false,
                    })
                );
                return results;
            }

            const issueNumberForContext =
                param.issue.isIssueComment ? param.issue.number : param.issueNumber;
            let issueDescription = '';
            if (issueNumberForContext > 0) {
                const desc = await this.issueDescriptionQueryPort.getDescription(
                    param.owner,
                    param.repo,
                    issueNumberForContext,
                    param.tokens.token,
                );
                if (desc?.trim()) {
                    issueDescription = desc.trim();
                }
            }

            const contextBlock = issueDescription
                ? `\n\nContext (issue #${issueNumberForContext} description):\n${issueDescription}\n\n`
                : '\n\n';
            logDebugInfo(`Think: question length=${question.length}, issue context length=${issueDescription.length}. Full question:\n${question}`);
            const prompt = getThinkPrompt({
                projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
                contextBlock,
                question,
            });
            logDebugInfo(`Think: calling configured agent (prompt length=${prompt.length}).`);
            const response = await this.aiRepository.query({
                configuration: param.ai?.getAgentConfiguration('findings'),
                agentId: AGENT_PLAN,
                prompt,
                options: {
                    expectJson: true,
                    schema: THINK_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
                    schemaName: 'think_response',
                },
            });
            const answer = extractStructuredAnswer(response);

            logDebugInfo(`Think: agent response received. Answer length=${answer.length}. Full answer:\n${answer}`);

            if (!answer) {
                logError('Configured agent returned no answer for Think.');
                results.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        errors: ['Configured agent returned no answer.'],
                    })
                );
                return results;
            }

            const issueOrPrNumber = param.issue.isIssueComment
                ? param.issue.number
                : param.pullRequest.number;
            if (issueOrPrNumber <= 0) {
                logError('Issue or PR number not available for adding comment.');
                results.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        errors: ['Issue or PR number not available.'],
                    })
                );
                return results;
            }

            await this.issueNotificationPort.addComment(
                param.owner,
                param.repo,
                issueOrPrNumber,
                answer.trim(),
                param.tokens.token,
            );
            logInfo(`Think response posted to ${param.issue.isIssueComment ? 'issue' : 'PR'} #${issueOrPrNumber}.`);

            results.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                })
            );
        } catch (error) {
            logError(`Error in ThinkUseCase: ${error}`);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: false,
                    errors: [`Error in ThinkUseCase: ${error}`],
                })
            );
        }
        return results;
    }
}
