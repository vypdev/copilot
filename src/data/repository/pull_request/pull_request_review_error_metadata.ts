import { toPullRequestReviewOperationError as semanticReviewError,
  type PullRequestReviewOperation, type PullRequestReviewErrorContext,
} from '../../../application/ports/pull_request_review_errors';

/** Only safe HTTP metadata crosses the provider boundary; provider prose never does. */
export function toPullRequestReviewOperationError(error: unknown, operation: PullRequestReviewOperation,
  context?: PullRequestReviewErrorContext) {
  if (!error || typeof error !== 'object') return semanticReviewError(error, operation, context);
  const record = error as { status?: unknown; response?: { headers?: Record<string, unknown> } };
  return semanticReviewError(error, operation, {
    ...context,
    ...(typeof record.status === 'number' ? { providerStatus: record.status } : {}),
    ...(typeof record.response?.headers?.['x-github-request-id'] === 'string'
      ? { providerReference: record.response.headers['x-github-request-id'] } : {}),
  });
}
