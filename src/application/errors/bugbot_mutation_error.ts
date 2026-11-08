import { pullRequestReviewProviderCode } from '../policies/pull_request_review_provider_code_policy';
import { ApplicationError, type ApplicationErrorCode } from './application_error';
import { PullRequestReviewOperationError, type PullRequestReviewOperation } from '../ports/pull_request_review_errors';

export interface BugbotMutationDiagnostic {
  readonly stage: 'publication' | 'resolution';
  readonly operation: PullRequestReviewOperation;
  readonly findingId: string;
  readonly affectedCount: number;
  readonly providerStatus: string;
  readonly providerReference: string;
  readonly errorCode: ApplicationErrorCode;
}

export class BugbotMutationError extends ApplicationError {
  constructor(readonly diagnostic: BugbotMutationDiagnostic) {
    super(diagnostic.errorCode, `Bugbot ${diagnostic.stage} failed: operation=${diagnostic.operation}; finding=${diagnostic.findingId}; affected=${diagnostic.affectedCount}; ${diagnostic.providerStatus}; provider-reference=${diagnostic.providerReference}. Completed effects are retained; correct the named cause and recheck the same target.`);
  }
}

export function bugbotMutationError(cause: unknown, stage: BugbotMutationDiagnostic['stage'], findingIds: readonly string[], fallback: PullRequestReviewOperation, affectedCount = findingIds.length): BugbotMutationError {
  if (cause instanceof BugbotMutationError) return cause;
  const provider = cause instanceof PullRequestReviewOperationError ? cause : undefined;
  const status = provider?.providerStatus;
  const errorCode = pullRequestReviewProviderCode(status);
  const first = findingIds[0];
  return new BugbotMutationError(Object.freeze({
    stage, operation: provider?.operation ?? fallback,
    findingId: typeof first === 'string' && /^[A-Za-z0-9_./:-]{1,200}$/.test(first) ? first : 'unavailable',
    affectedCount: Math.min(affectedCount, 10_000),
    providerStatus: status ? `http-${status}` : 'http-unavailable',
    providerReference: provider?.providerReference ?? 'unavailable', errorCode,
  }));
}
