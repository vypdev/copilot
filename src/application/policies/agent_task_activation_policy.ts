import type { AgentTask } from '../../domain/agent';
import { ACTIONS } from '../../data/model/action_types';
import type { SingleAction } from '../../data/model/single_action';
import type { GithubActionEventInputs } from '../../actions/github_event_inputs';
import { parseCopilotCommand } from '../../domain/copilot_command';
import { containsBotMention } from '../usecases/steps/common/think_input_policy';

const COMMENT_TASKS: readonly AgentTask[] = ['findings', 'fixer', 'planner', 'reviewer', 'tester'];

/** Returns only roles that can be reached by the current event or single action. */
export function activeAgentTasks(
    event: GithubActionEventInputs,
    singleAction: SingleAction,
    botLogin = '',
    pullRequestDescriptionEnabled = true,
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
            return ['opened', 'edited'].includes(eventAction(event)) ? ['planner'] : [];
        case 'pull_request':
            if (!['opened', 'reopened', 'synchronize'].includes(eventAction(event))) return [];
            return pullRequestDescriptionEnabled ? ['planner', 'reviewer'] : ['reviewer'];
        case 'pull_request_review':
            return [];
        case 'push':
            return ['findings'];
        case 'issue_comment':
        case 'pull_request_review_comment':
            return activeCommentTasks(event, botLogin);
        default:
            return [];
    }
}

function activeCommentTasks(event: GithubActionEventInputs, botLogin: string): AgentTask[] {
    const body = commentBody(event);
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
            default:
                return [];
        }
    }
    if (!body || !containsBotMention(body, botLogin)) return ['findings'];
    return isPullRequestComment(event)
        ? COMMENT_TASKS.filter(task => task !== 'tester')
        : ['findings', 'fixer', 'planner'];
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
    const issue = event.issue;
    return Boolean(issue && typeof issue === 'object' && issue.pull_request);
}
