import { Result } from '../../../../data/model/result';
import { AGENT_PLAN } from '../../../../application/policies/agent_task_policy';
import { THINK_RESPONSE_SCHEMA } from '../../../../application/policies/agent_response_schemas';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { BoundIssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import { getThinkPrompt } from '../../../../prompts';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../../../utils/project_context_instruction';
import { extractStructuredAnswer } from './agent_answer_policy';
import type { ThinkRequestDecision } from './think_request_policy';
import { sanitizeAgentMarkdown } from '../../../../application/policies/github_comment_publication_policy';
import { ApplicationError } from '../../../errors/application_error';
import type { AgentConfiguration } from '../../../../data/model/agent';
import type { AgentTask } from '../../../../domain/agent';
import type { TranslationPublication } from '../../../policies/comment_translation_policy';
import { productFacingAgentQueryOptions } from '../../../policies/agent_output_locale_policy';

export interface ThinkAnswerDependencies {
    issueDescriptionQueryPort: BoundIssueDescriptionQueryPort;
    aiRepository: FindingsQueryPort;
}

type ReadyThinkRequest = Extract<ThinkRequestDecision, { kind: 'ready' }>;

export interface ThinkAnswerContext {
    readonly request: ReadyThinkRequest;
    readonly tokenUser?: string;
    readonly agentTask: AgentTask;
    readonly agentConfiguration: Readonly<AgentConfiguration>;
    readonly translationPublication?: TranslationPublication;
    readonly targetLocale: string;
}

export async function runThinkAnswerWorkflow(
    param: ThinkAnswerContext,
    taskId: string,
    request: ReadyThinkRequest,
    dependencies: ThinkAnswerDependencies,
): Promise<Result[]> {
    const issueDescription = await loadIssueDescription(
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
        targetLocale: param.targetLocale,
    });
    const answer = sanitizeAgentMarkdown(await queryThinkAnswer(
        param,
        prompt,
        dependencies.aiRepository,
        param.targetLocale,
    ));
    if (!answer) {
        logError('Configured agent returned no answer for Think.');
        return [
            new Result({
                id: taskId,
                success: false,
                executed: true,
                errors: [new ApplicationError('agent.failed', 'Configured agent returned no answer.')],
            }),
        ];
    }
    if (request.destinationType !== 'local' && (!request.destinationNumber || request.destinationNumber <= 0)) {
        logError('Issue or PR number not available for adding comment.');
        return [
            new Result({
                id: taskId,
                success: false,
                executed: true,
                errors: [new ApplicationError('validation.invalid-input', 'Issue or PR number not available.')],
            }),
        ];
    }

    logInfo(request.destinationType === 'local'
        ? 'Think response prepared for local output.'
        : `Think response prepared for ${request.destinationType} #${request.destinationNumber}.`);
    return [new Result({
        id: taskId,
        success: true,
        executed: true,
        payload: Object.freeze({
            publication: Object.freeze({
                kind: 'direct-answer' as const,
                answer,
                ...(param.translationPublication
                    ? { translation: Object.freeze({ ...param.translationPublication }) }
                    : {}),
            }),
        }),
    })];
}

async function loadIssueDescription(
    issueNumber: number,
    repository: BoundIssueDescriptionQueryPort,
): Promise<string> {
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) return '';
    const description = await repository.getDescription(
        issueNumber,
    );
    return description?.trim() ?? '';
}

async function queryThinkAnswer(
    param: ThinkAnswerContext,
    prompt: string,
    repository: FindingsQueryPort,
    targetLocale: string,
): Promise<string> {
    logDebugInfo(`Think: calling configured agent (prompt length=${prompt.length}).`);
    const response = await repository.query({
        configuration: param.agentConfiguration,
        agentId: AGENT_PLAN,
        prompt,
        options: productFacingAgentQueryOptions('think', THINK_RESPONSE_SCHEMA),
    });
    const answer = extractStructuredAnswer(response, targetLocale);
    logDebugInfo(`Think: agent response received. Answer length=${answer.length}.`);
    return answer;
}
