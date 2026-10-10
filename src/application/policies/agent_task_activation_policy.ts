import type { AgentTask } from '../../domain/agent';
import { ACTIONS } from '../../data/model/action_types';
import type { SingleAction } from '../../data/model/single_action';
import type { GithubActionEventInputs } from '../../actions/github_event_inputs';
import { parseCopilotCommand } from '../../domain/copilot_command';
import { containsBotMention, isCopilotCommentRequest } from '../../domain/copilot_comment_request';
import { isNaturalLanguageBranchSyncRequest, parseBranchSyncCommandArguments } from '../../domain/branch_sync_command';
import { isPullRequestConversationComment } from '../../domain/github_comment_target';
import { ISSUE_START_LABEL } from '../../domain/issue_start_policy';
import { isSddAnswerComment } from '../../domain/pre_branch_sdd';

const COMMENT_TASKS: readonly AgentTask[] = ['findings', 'fixer', 'planner', 'reviewer', 'tester'];

/** Returns only roles that can be reached by the current event or single action. */
export function activeAgentTasks(
    event: GithubActionEventInputs,
    singleAction: SingleAction,
    botLogin = '',
    pullRequestDescriptionEnabled = true,
    preBranchSddEnabled = false,
): AgentTask[] {
    if (singleAction.enabledSingleAction) {
        switch (singleAction.currentSingleAction) {
            case ACTIONS.THINK:
            case ACTIONS.RECOMMEND_STEPS:
                return ['planner'];
            case ACTIONS.CHECK_PROGRESS:
                return ['findings'];
            case ACTIONS.DETECT_POTENTIAL_PROBLEMS:
                // The target is resolved later through GitHub, and may be an
                // issue (findings) or PR (reviewer).
                return ['findings', 'reviewer'];
            default:
                return [];
        }
    }

    switch (event.eventName) {
        case 'issues':
            return activeIssueTasks(event, preBranchSddEnabled);
        case 'pull_request':
            if (!['opened', 'reopened', 'synchronize'].includes(eventAction(event))) return [];
            return pullRequestDescriptionEnabled ? ['planner', 'reviewer'] : ['reviewer'];
        case 'pull_request_review':
            return [];
        case 'push':
            return ['findings'];
        case 'issue_comment':
        case 'pull_request_review_comment':
            return activeCommentTasks(event, botLogin, preBranchSddEnabled);
        default:
            return [];
    }
}

function activeIssueTasks(event: GithubActionEventInputs, preBranchSddEnabled: boolean): AgentTask[] {
    const action = eventAction(event);
    if (['opened', 'edited'].includes(action)) return ['planner'];
    if (action === 'labeled' && event.label?.name === ISSUE_START_LABEL) return ['planner'];
    // A started SDD may resume on metadata changes or reopen, after live admission.
    if (preBranchSddEnabled && ['reopened', 'labeled', 'unlabeled', 'assigned', 'unassigned'].includes(action)
        && Array.isArray(event.issue?.labels)
        && event.issue.labels.some(label => typeof label === 'object' && label?.name === ISSUE_START_LABEL)) {
        return ['planner'];
    }
    return [];
}

function activeCommentTasks(event: GithubActionEventInputs, botLogin: string, preBranchSddEnabled: boolean): AgentTask[] {
    const body = commentBody(event);
    if (isSddContinuationComment(event, preBranchSddEnabled)) return ['planner'];
    if (!isCopilotCommentRequest(body, botLogin)) return [];
    const command = parseCopilotCommand(body);
    if (command.kind === 'invalid') return [];
    if (command.kind === 'command') {
        switch (command.command.name) {
            case 'description':
                return isPullRequestComment(event) ? ['planner'] : [];
            case 'plan':
            case 'clarify':
            case 'estimate':
            case 'explain':
            case 'diagnose':
                return ['planner'];
            case 'test-plan':
                return ['tester'];
            case 'analyze':
            case 'review':
            case 'findings':
            case 'recheck':
                return [isPullRequestComment(event) ? 'reviewer' : 'findings'];
            case 'fix':
                return ['fixer', isPullRequestComment(event) ? 'reviewer' : 'findings'];
            case 'implement':
                return ['fixer'];
            case 'sync-branch':
                return branchSyncAgentTasks(command.command.arguments);
            default:
                return [];
        }
    }
    if (isNaturalLanguageBranchSyncRequest(body, botLogin)) return ['fixer'];
    if (!containsBotMention(body, botLogin)) return [];
    return isPullRequestComment(event)
        ? COMMENT_TASKS.filter(task => task !== 'tester')
        : ['findings', 'fixer', 'planner'];
}

/** Discards passive comment traffic before project, AI, and runtime composition. */
export function isUnaddressedCommentEvent(event: GithubActionEventInputs, botLogin: string, preBranchSddEnabled = false): boolean {
    if (!['issue_comment', 'pull_request_review_comment'].includes(event.eventName)) return false;
    if (isSddContinuationComment(event, preBranchSddEnabled)) return false;
    return !isCopilotCommentRequest(commentBody(event), botLogin);
}

function isSddContinuationComment(event: GithubActionEventInputs, preBranchSddEnabled: boolean): boolean {
    return preBranchSddEnabled && event.eventName === 'issue_comment'
        && !isPullRequestComment(event) && isSddAnswerComment(commentBody(event));
}

function branchSyncAgentTasks(args: readonly string[]): AgentTask[] {
    const parsed = parseBranchSyncCommandArguments(args);
    return parsed.valid && parsed.options.useAgent && !parsed.options.dryRun ? ['fixer'] : [];
}

function eventAction(event: GithubActionEventInputs): string {
    return typeof event.action === 'string' ? event.action : '';
}

function commentBody(event: GithubActionEventInputs): string {
    const comment = event.comment;
    return comment && typeof comment === 'object' && typeof comment.body === 'string'
        ? comment.body
        : '';
}

function isPullRequestComment(event: GithubActionEventInputs): boolean {
    if (event.eventName === 'pull_request_review_comment') return true;
    return isPullRequestConversationComment(event);
}
