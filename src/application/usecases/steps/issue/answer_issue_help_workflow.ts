import { isAgentConfigurationReady } from '../../../../data/model/agent';
import type { AgentConfiguration } from '../../../../data/model/agent';
import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import { AGENT_PLAN } from '../../../../application/policies/agent_task_policy';
import { THINK_RESPONSE_SCHEMA } from '../../../../application/policies/agent_response_schemas';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { getAnswerIssueHelpPrompt } from '../../../../prompts';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../../../utils/project_context_instruction';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { extractStructuredAnswer } from '../common/agent_answer_policy';
import { sanitizeAgentMarkdown } from '../../../../application/policies/github_comment_publication_policy';

export interface AnswerIssueHelpWorkflowDependencies {
    issueNotificationPort: IssueNotificationPort;
    aiRepository: FindingsQueryPort;
}

const TASK_ID = 'AnswerIssueHelpUseCase';

/** Posts one contextual answer for a newly opened question/help issue. */
export async function runAnswerIssueHelpWorkflow(
    param: Execution,
    dependencies: AnswerIssueHelpWorkflowDependencies,
): Promise<Result[]> {
    logInfo('AnswerIssueHelp: checking if initial help reply is needed (AI).');
    try {
        const request = resolveHelpRequest(param);
        if (!request) return skipped();
        const { issueNumber, description, configuration } = request;

        logInfo(`${getTaskEmoji(TASK_ID)} Posting initial help reply for question/help issue #${issueNumber}.`);
        const prompt = getAnswerIssueHelpPrompt({
            description,
            projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
        });
        logDebugInfo(
            `AnswerIssueHelp: prompt length=${prompt.length}, issue description length=${description.length}. Calling configured agent.`,
        );
        const response = await dependencies.aiRepository.query({
            configuration,
            agentId: AGENT_PLAN,
            prompt,
            options: {
                expectJson: true,
                schema: THINK_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
                schemaName: 'answer_issue_help_response',
            },
        });
        const answer = sanitizeAgentMarkdown(extractStructuredAnswer(response));
        logDebugInfo(`AnswerIssueHelp: agent response. Answer length=${answer.length}.`);
        if (!answer) {
            return [noAnswerResult()];
        }

        await dependencies.issueNotificationPort.addComment(
            param.owner,
            param.repo,
            issueNumber,
            answer,
            param.tokens.token,
        );
        logInfo(`Initial help reply posted to issue #${issueNumber}.`);
        return [new Result({ id: TASK_ID, success: true, executed: true })];
    } catch (error) {
        logError(`Error in ${TASK_ID}: ${error}`);
        return [new Result({
            id: TASK_ID,
            success: false,
            executed: true,
            errors: [`Error in ${TASK_ID}: ${error}`],
        })];
    }
}

interface HelpRequest {
    issueNumber: number;
    description: string;
    configuration: AgentConfiguration;
}

function resolveHelpRequest(param: Execution): HelpRequest | undefined {
    if (!param.issue.opened || (!param.labels.isQuestion && !param.labels.isHelp)) return undefined;
    const configuration = param.ai?.getAgentConfiguration('findings');
    if (!isAgentConfigurationReady(configuration)) {
        logInfo('Agent not configured; skipping initial help reply.');
        return undefined;
    }
    if (param.issue.number <= 0) return undefined;
    const description = (param.issue.body ?? '').trim();
    if (!description) {
        logInfo('Issue has no body; skipping initial help reply.');
        return undefined;
    }
    return { issueNumber: param.issue.number, description, configuration };
}

function noAnswerResult(): Result {
    logError('Configured agent returned no answer for initial help.');
    return new Result({
        id: TASK_ID,
        success: false,
        executed: true,
        errors: ['Configured agent returned no answer for initial help.'],
    });
}

function skipped(): Result[] {
    return [new Result({ id: TASK_ID, success: true, executed: false })];
}
