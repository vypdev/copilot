export type PullRequestReviewOperation =
  | "list-reviewers"
  | "request-reviewers"
  | "assign-reviewers"
  | "list-comments"
  | "list-threads"
  | "list-reviews"
  | "get-comment"
  | "list-files"
  | "get-head-sha"
  | "get-source-bound-pr"
  | "publish-comments"
  | "update-comment"
  | "update-review"
  | "resolve-thread"
  | "unresolve-thread"
  | "mark-resolved";

export interface PullRequestReviewErrorContext {
  readonly providerFailure?: 'response-invalid';
  readonly providerStatus?: number;
  readonly providerReference?: string;
  failedCount?: number;
  totalCount?: number;
}

const ERROR_MESSAGES: Record<PullRequestReviewOperation, string> = {
  "list-reviewers": "Unable to list pull request reviewers.",
  "request-reviewers": "Unable to request pull request reviewers.",
  "assign-reviewers": "Unable to assign pull request reviewers.",
  "list-comments": "Unable to list pull request review comments.",
  "list-threads": "Unable to list pull request review threads.",
  "list-reviews": "Unable to list pull request reviews.",
  "get-comment": "Unable to get the pull request review comment.",
  "list-files": "Unable to list pull request changed files.",
  "get-head-sha": "Unable to get the pull request head commit.",
  "get-source-bound-pr": "Unable to get the source-bound pull request identity.",
  "publish-comments": "Failed to publish pull request review comments.",
  "update-comment": "Unable to update the pull request review comment.",
  "update-review": "Unable to update the pull request review summary.",
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
  readonly providerFailure?: 'response-invalid';
  readonly operation: PullRequestReviewOperation;
  readonly providerStatus?: number;
  readonly providerReference?: string;

  constructor(
    operation: PullRequestReviewOperation,
    context?: PullRequestReviewErrorContext,
  ) {
    super(buildMessage(operation, context));
    this.name = "PullRequestReviewOperationError";
    this.operation = operation;
    if (context?.providerFailure === 'response-invalid') this.providerFailure = context.providerFailure;
    const status = context?.providerStatus;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) {
      this.providerStatus = status;
    }
    if (typeof context?.providerReference === 'string' && /^[A-Za-z0-9:-]{1,64}$/.test(context.providerReference)) {
      this.providerReference = context.providerReference;
    }
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
