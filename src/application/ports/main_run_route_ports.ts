import type { Execution } from '../../data/model/execution';
import type { Result } from '../../data/model/result';

/**
 * Routes are application orchestration concepts. Entry points resolve them,
 * while composition roots provide their handlers.
 */
export type MainRunRoute =
    | 'single-action'
    | 'issue-comment'
    | 'issue'
    | 'pull-request-review-comment'
    | 'pull-request'
    | 'push'
    | 'unhandled';

export interface MainRunRouteInput {
    isSingleAction: boolean;
    isIssue: boolean;
    isIssueComment: boolean;
    isPullRequest: boolean;
    isPullRequestReviewComment: boolean;
    isPush: boolean;
}

export type ExecutableMainRunRoute = Exclude<MainRunRoute, 'unhandled'>;
export type MainRunRouteHandler = (execution: Execution) => Promise<Result[]>;
export type MainRunRouteHandlers = Record<ExecutableMainRunRoute, MainRunRouteHandler>;
