import { isAgentConfigurationReady } from '../../../../data/model/agent';
import type { AgentConfiguration } from '../../../../data/model/agent';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { BoundIssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { BoundIssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { logError, logInfo } from '../../../ports/logging_ports';
import { resolveThinkRequest } from './think_request_policy';
import type { ThinkRequestDecision } from './think_request_policy';
import { runThinkAnswerWorkflow } from './think_answer_workflow';
import { resolveThinkAgentTask } from '../../../../application/policies/agent_task_policy';
import type { AgentTask } from '../../../../domain/agent';
import { ApplicationError, toApplicationError } from '../../../errors/application_error';
import type { ThinkRequestSource } from './think_request_policy';

export interface ThinkWorkflowDependencies {
    issueDescriptionQueryPort: BoundIssueDescriptionQueryPort;
    issueNotificationPort: BoundIssueNotificationPort;
    aiRepository: FindingsQueryPort;
}

export type ThinkContext =
    | {
        readonly request: Extract<ThinkRequestDecision, { kind: 'skip' }>;
        readonly tokenUser?: string;
    }
    | {
        readonly request: Extract<ThinkRequestDecision, { kind: 'ready' }>;
        readonly tokenUser?: string;
        readonly agentTask: AgentTask;
        readonly agentConfiguration: Readonly<AgentConfiguration>;
    };

export interface ThinkContextSource extends ThinkRequestSource {
    readonly ai: { getAgentConfiguration(task: AgentTask): AgentConfiguration };
}

export function projectThinkContext(source: ThinkContextSource): ThinkContext {
    const request = resolveThinkRequest(source);
    const tokenUser = source.tokenUser?.trim();
    if (request.kind === 'skip') {
        return Object.freeze({ request: Object.freeze({ ...request }), ...(tokenUser ? { tokenUser } : {}) });
    }
    const agentTask = resolveThinkAgentTask(request.command?.name, request.destinationType);
    return Object.freeze({
        request: Object.freeze({
            ...request,
            ...(request.command ? { command: Object.freeze({
                ...request.command,
                arguments: Object.freeze([...request.command.arguments]),
            }) } : {}),
        }),
        ...(tokenUser ? { tokenUser } : {}),
        agentTask,
        agentConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration(agentTask) }),
    });
}

export async function runThinkWorkflow(
    param: ThinkContext,
    taskId: string,
    dependencies: ThinkWorkflowDependencies,
): Promise<Result[]> {
    logInfo('Think: processing comment (AI Q&A).');

    try {
        const request = param.request;
        if (request.kind === 'skip') {
            logSkipReason(request.reason, param.tokenUser);
            return skipped(taskId);
        }
        if (!('agentConfiguration' in param)) {
            throw new ApplicationError('provider.contract-invalid', 'Ready Think context is missing its selected agent configuration.');
        }
        if (!isAgentConfigurationReady(param.agentConfiguration)) {
            return [
                new Result({
                    id: taskId,
                    success: false,
                    executed: false,
                    errors: [new ApplicationError('configuration.invalid', 'Configured agent model or executable not found.')],
                }),
            ];
        }
        return await runThinkAnswerWorkflow(param, taskId, request, dependencies);
    } catch (error) {
        const semanticError = toApplicationError(error, 'agent.failed', 'Error in ThinkUseCase: unable to complete the request.');
        logError(semanticError);
        return [
            new Result({
                id: taskId,
                success: false,
                executed: false,
                errors: [semanticError],
            }),
        ];
    }
}

function skipped(taskId: string): Result[] {
    return [new Result({ id: taskId, success: true, executed: false })];
}

function logSkipReason(
    reason: Extract<ThinkRequestDecision, { kind: 'skip' }>['reason'],
    tokenUser?: string,
): void {
    if (reason === 'missing-token') {
        logInfo('Bot username (tokenUser) not set; skipping Think response.');
    } else if (reason === 'not-mentioned') {
        logInfo(`Comment does not mention @${tokenUser}; skipping.`);
    } else if (reason === 'invalid-command') {
        logInfo('Invalid explicit Copilot command; skipping.');
    }
}
