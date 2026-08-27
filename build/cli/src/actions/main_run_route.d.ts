export type MainRunRoute = 'single-action' | 'issue-comment' | 'issue' | 'pull-request-review-comment' | 'pull-request' | 'push' | 'unhandled';
export interface MainRunRouteInput {
    isSingleAction: boolean;
    isIssue: boolean;
    isIssueComment: boolean;
    isPullRequest: boolean;
    isPullRequestReviewComment: boolean;
    isPush: boolean;
}
export declare function resolveMainRunRoute(input: MainRunRouteInput): MainRunRoute;
