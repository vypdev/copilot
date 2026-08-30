export type PullRequestReviewOperation =
  | "list-reviewers"
  | "request-reviewers"
  | "assign-reviewers"
  | "list-comments"
  | "get-comment"
  | "list-files"
  | "get-head-sha"
  | "publish-comments"
  | "update-comment"
  | "resolve-thread"
  | "unresolve-thread"
  | "mark-resolved";

interface PullRequestReviewErrorContext {
  failedCount?: number;
  totalCount?: number;
}

const ERROR_MESSAGES: Record<PullRequestReviewOperation, string> = {
  "list-reviewers": "Unable to list pull request reviewers.",
  "request-reviewers": "Unable to request pull request reviewers.",
  "assign-reviewers": "Unable to assign pull request reviewers.",
  "list-comments": "Unable to list pull request review comments.",
  "get-comment": "Unable to get the pull request review comment.",
  "list-files": "Unable to list pull request changed files.",
  "get-head-sha": "Unable to get the pull request head commit.",
  "publish-comments": "Failed to publish pull request review comments.",
  "update-comment": "Unable to update the pull request review comment.",
  "resolve-thread": "Unable to resolve the pull request review thread.",
  "unresolve-thread": "Unable to reopen the pull request review thread.",
  "mark-resolved": "Unable to mark a pull request finding as resolved.",
};

function buildMessage(
  operation: PullRequestReviewOperation,
  context?: PullRequestReviewErrorContext,
): string {
  const baseMessage = ERROR_MESSAGES[operation];
  if (
    operation !== "publish-comments" ||
    context?.failedCount == null ||
    context.totalCount == null
  ) {
    return baseMessage;
  }
  return `Failed to publish ${context.failedCount} of ${context.totalCount} pull request review comments.`;
}

export class PullRequestReviewOperationError extends Error {
  readonly operation: PullRequestReviewOperation;

  constructor(
    operation: PullRequestReviewOperation,
    context?: PullRequestReviewErrorContext,
  ) {
    super(buildMessage(operation, context));
    this.name = "PullRequestReviewOperationError";
    this.operation = operation;
  }
}

export function toPullRequestReviewOperationError(
  error: unknown,
  operation: PullRequestReviewOperation,
  context?: PullRequestReviewErrorContext,
): PullRequestReviewOperationError {
  return error instanceof PullRequestReviewOperationError
    ? error
    : new PullRequestReviewOperationError(operation, context);
}
