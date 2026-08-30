export type PullRequestReviewOperation = "list-reviewers" | "request-reviewers" | "assign-reviewers" | "list-comments" | "get-comment" | "list-files" | "get-head-sha" | "publish-comments" | "update-comment" | "resolve-thread" | "unresolve-thread" | "mark-resolved";
interface PullRequestReviewErrorContext {
    failedCount?: number;
    totalCount?: number;
}
export declare class PullRequestReviewOperationError extends Error {
    readonly operation: PullRequestReviewOperation;
    constructor(operation: PullRequestReviewOperation, context?: PullRequestReviewErrorContext);
}
export declare function toPullRequestReviewOperationError(error: unknown, operation: PullRequestReviewOperation, context?: PullRequestReviewErrorContext): PullRequestReviewOperationError;
export {};
