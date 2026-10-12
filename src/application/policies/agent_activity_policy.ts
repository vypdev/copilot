import type { AgentConfiguration, AgentTask } from '../../domain/agent';
import { isAgentConfigurationReady } from '../../domain/agent';
import { parseCopilotCommand, type CopilotCommandName } from '../../domain/copilot_command';
import { parseBranchSyncCommandArguments } from '../../domain/branch_sync_command';

const DETERMINISTIC_COMMENT_COMMANDS: ReadonlySet<CopilotCommandName> = new Set(['help', 'status', 'sdd-diff', 'dismiss', 'remember']);

export type AgentActivityRoute =
    | 'single-action'
    | 'issue-comment'
    | 'issue'
    | 'pull-request-review-comment'
    | 'pull-request'
    | 'push';

export interface AgentActivityExecutionContext {
    readonly eventName: string;
    readonly issueNumber: number;
    readonly issue: {
        readonly number: number;
        readonly opened: boolean;
        readonly descriptionEdited: boolean;
        readonly commentBody: string;
    };
    readonly pullRequest: {
        readonly number: number;
        readonly action: string;
        readonly commentBody: string;
    };
    readonly commit: {
        readonly commits: readonly unknown[];
    };
    readonly singleAction: {
        readonly isThinkAction: boolean;
        readonly isRecommendStepsAction: boolean;
        readonly isCheckProgressAction: boolean;
        readonly isDetectPotentialProblemsAction: boolean;
    };
    readonly ai: {
        readonly getPullRequestDescriptionMode: () => string;
        readonly getAgentConfiguration: (task: AgentTask) => AgentConfiguration | undefined;
    };
}

/** Decides whether a route can invoke an agent for its current event. */
export function shouldTrackAgentActivity(
    execution: AgentActivityExecutionContext,
    route: AgentActivityRoute,
): boolean {
    if (!hasTarget(execution)) return false;

    switch (route) {
        case 'issue':
            return (execution.issue.opened || execution.issue.descriptionEdited)
                && isAgentReady(execution, 'planner');
        case 'issue-comment':
        case 'pull-request-review-comment':
            return hasAgentCapableComment(execution)
                && (isAgentReady(execution, 'planner')
                    || isAgentReady(execution, 'findings')
                    || isAgentReady(execution, 'fixer')
                    || isAgentReady(execution, 'reviewer'));
        case 'pull-request':
            if (execution.pullRequest.action === 'ready_for_review') return isAgentReady(execution, 'reviewer');
            return ['opened', 'reopened', 'synchronize'].includes(execution.pullRequest.action)
                && (isAgentReady(execution, 'reviewer')
                    || (['replace', 'append'].includes(execution.ai.getPullRequestDescriptionMode())
                        && isAgentReady(execution, 'planner')));
        case 'push':
            return execution.commit.commits.length > 0 && isAgentReady(execution, 'findings');
        case 'single-action':
            return isAgentBackedSingleAction(execution);
        default:
            return false;
    }
}

function isAgentBackedSingleAction(execution: AgentActivityExecutionContext): boolean {
    if (execution.singleAction.isThinkAction || execution.singleAction.isRecommendStepsAction) {
        return isAgentReady(execution, 'planner');
    }
    if (execution.singleAction.isCheckProgressAction || execution.singleAction.isDetectPotentialProblemsAction) {
        return isAgentReady(execution, 'findings');
    }
    return false;
}

function isAgentReady(execution: AgentActivityExecutionContext, task: AgentTask): boolean {
    return isAgentConfigurationReady(execution.ai.getAgentConfiguration(task));
}

function hasAgentCapableComment(execution: AgentActivityExecutionContext): boolean {
    const body = execution.issue.commentBody || execution.pullRequest.commentBody || '';
    if (!body.trim()) return false;
    const parsed = parseCopilotCommand(body);
    if (parsed.kind === 'invalid') return false;
    if (parsed.kind === 'command') {
        if (DETERMINISTIC_COMMENT_COMMANDS.has(parsed.command.name)) return false;
        if (parsed.command.name === 'sync-branch') {
            const sync = parseBranchSyncCommandArguments(parsed.command.arguments);
            return sync.valid && !sync.options.dryRun && sync.options.useAgent;
        }
    }
    return true;
}

function hasTarget(execution: AgentActivityExecutionContext): boolean {
    if (['pull_request', 'pull_request_review', 'pull_request_review_comment', 'check_suite', 'workflow_run'].includes(execution.eventName)) {
        return execution.pullRequest.number > 0;
    }
    return execution.issue.number > 0 || execution.issueNumber > 0;
}
