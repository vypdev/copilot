import { isAgentConfigurationReady } from '../../../../data/model/agent';
import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { logError, logInfo } from '../../../ports/logging_ports';
import { resolveThinkRequest } from './think_request_policy';
import type { ThinkRequestDecision } from './think_request_policy';
import { runThinkAnswerWorkflow } from './think_answer_workflow';
import { resolveThinkAgentTask } from '../../../../application/policies/agent_task_policy';

export interface ThinkWorkflowDependencies {
    issueDescriptionQueryPort: IssueDescriptionQueryPort;
    issueNotificationPort: IssueNotificationPort;
    aiRepository: FindingsQueryPort;
}

export async function runThinkWorkflow(
    param: Execution,
    taskId: string,
    dependencies: ThinkWorkflowDependencies,
): Promise<Result[]> {
    logInfo('Think: processing comment (AI Q&A).');

    try {
        const request = resolveThinkRequest(param);
        if (request.kind === 'skip') {
            logSkipReason(request.reason, param.tokenUser);
            return skipped(taskId);
        }
        const agentTask = resolveThinkAgentTask(request.command?.name, request.destinationType);
        if (!isAgentConfigurationReady(param.ai?.getAgentConfiguration(agentTask))) {
            return [
                new Result({
                    id: taskId,
                    success: false,
                    executed: false,
                    errors: ['Configured agent model or CLI command not found.'],
                }),
            ];
        }
        return await runThinkAnswerWorkflow(param, taskId, request, dependencies, agentTask);
    } catch (error) {
        logError(`Error in ThinkUseCase: ${error}`);
        return [
            new Result({
                id: taskId,
                success: false,
                executed: false,
                errors: [`Error in ThinkUseCase: ${error}`],
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
