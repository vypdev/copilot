import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import { AGENT_PLAN } from '../../../../application/policies/agent_task_policy';
import { THINK_RESPONSE_SCHEMA } from '../../../../application/policies/agent_response_schemas';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { getThinkPrompt } from '../../../../prompts';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../../../utils/project_context_instruction';
import { extractStructuredAnswer } from './agent_answer_policy';
import type { ThinkRequestDecision } from './think_request_policy';
import { sanitizeAgentMarkdown } from '../../../../application/policies/github_comment_publication_policy';
import type { AgentTask } from '../../../../domain/agent';

export interface ThinkAnswerDependencies {
    issueDescriptionQueryPort: IssueDescriptionQueryPort;
    issueNotificationPort: IssueNotificationPort;
    aiRepository: FindingsQueryPort;
}

type ReadyThinkRequest = Extract<ThinkRequestDecision, { kind: 'ready' }>;

export async function runThinkAnswerWorkflow(
    param: Execution,
    taskId: string,
    request: ReadyThinkRequest,
    dependencies: ThinkAnswerDependencies,
    agentTask: AgentTask,
): Promise<Result[]> {
    const issueDescription = await loadIssueDescription(
        param,
        request.issueNumberForContext,
        dependencies.issueDescriptionQueryPort,
    );
    const contextBlock = issueDescription
        ? `\n\nContext (issue #${request.issueNumberForContext} description):\n${issueDescription}\n\n`
        : '\n\n';
    logDebugInfo(`Think: question length=${request.question.length}, issue context length=${issueDescription.length}.`);

    const prompt = getThinkPrompt({
        projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
        contextBlock,
        question: request.question,
    });
    const answer = sanitizeAgentMarkdown(await queryThinkAnswer(param, prompt, dependencies.aiRepository, agentTask));
    if (!answer) {
        logError('Configured agent returned no answer for Think.');
        return [
            new Result({
                id: taskId,
                success: false,
                executed: true,
                errors: ['Configured agent returned no answer.'],
            }),
        ];
    }
    if (request.destinationNumber <= 0) {
        logError('Issue or PR number not available for adding comment.');
        return [
            new Result({
                id: taskId,
                success: false,
                executed: true,
                errors: ['Issue or PR number not available.'],
            }),
        ];
    }

    await dependencies.issueNotificationPort.addComment(
        param.owner,
        param.repo,
        request.destinationNumber,
        answer,
        param.tokens.token,
    );
    logInfo(
        `Think response posted to ${request.destinationType} #${request.destinationNumber}.`,
    );
    return [new Result({ id: taskId, success: true, executed: true })];
}

async function loadIssueDescription(
    param: Execution,
    issueNumber: number,
    repository: IssueDescriptionQueryPort,
): Promise<string> {
    if (issueNumber <= 0) return '';
    const description = await repository.getDescription(
        param.owner,
        param.repo,
        issueNumber,
        param.tokens.token,
    );
    return description?.trim() ?? '';
}

async function queryThinkAnswer(
    param: Execution,
    prompt: string,
    repository: FindingsQueryPort,
    agentTask: AgentTask,
): Promise<string> {
    logDebugInfo(`Think: calling configured agent (prompt length=${prompt.length}).`);
    const response = await repository.query({
        configuration: param.ai?.getAgentConfiguration(agentTask),
        agentId: AGENT_PLAN,
        prompt,
        options: {
            expectJson: true,
            schema: THINK_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
            schemaName: 'think_response',
        },
    });
    const answer = extractStructuredAnswer(response);
    logDebugInfo(`Think: agent response received. Answer length=${answer.length}.`);
    return answer;
}
