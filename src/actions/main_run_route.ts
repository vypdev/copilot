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

export function resolveMainRunRoute(input: MainRunRouteInput): MainRunRoute {
    if (input.isSingleAction) return 'single-action';
    if (input.isIssue) return input.isIssueComment ? 'issue-comment' : 'issue';
    if (input.isPullRequest) {
        return input.isPullRequestReviewComment ? 'pull-request-review-comment' : 'pull-request';
    }
    if (input.isPush) return 'push';
    return 'unhandled';
}
