import { parseCopilotCommand } from '../../domain/copilot_command';
export interface ConfigurationPersistenceContext {
    readonly isSingleAction: boolean;
    readonly eventName?: string;
    readonly inputs?: { readonly comment?: { readonly body?: string | null }; readonly pull_request_review_comment?: { readonly body?: string | null } };
    readonly singleAction: {
        readonly isRecommendStepsAction: boolean;
    };
}

/**
 * Decides whether the completion phase has persistent execution state to save.
 *
 * Release/deployment single actions use the issue configuration as read-only
 * context. Writing it back after every action is unnecessary and can race with
 * the issue-comment workflow triggered by the action's own notification.
 * Recommendation actions are the exception because they persist their
 * fingerprint and latest recommendation in the hidden issue configuration.
 */
export function shouldPersistConfiguration(execution: ConfigurationPersistenceContext): boolean {
    if (!execution.isSingleAction) {
        if (['issue_comment', 'pull_request_review_comment'].includes(execution.eventName ?? '')) {
            const body = execution.inputs?.pull_request_review_comment?.body ?? execution.inputs?.comment?.body;
            const command = parseCopilotCommand(typeof body === 'string' ? body : '');
            if (command.kind === 'command' && command.command.arguments.length === 0 && ['help', 'status', 'doctor', 'history', 'sdd-diff'].includes(command.command.name)) return false;
        }
        return true;
    }
    return execution.singleAction.isRecommendStepsAction;
}
