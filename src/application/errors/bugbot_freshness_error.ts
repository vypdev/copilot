import { ApplicationError } from './application_error';
import { PullRequestReviewOperationError } from '../ports/pull_request_review_errors';
import { pullRequestReviewProviderCode } from '../policies/pull_request_review_provider_code_policy';
import type { BugbotFreshnessDiagnostic, BugbotFreshnessOperation } from '../../domain/bugbot/review_freshness_failure';

export type BugbotFreshnessBoundary = 'before-publication' | 'after-publication';
export function bugbotFreshnessError(cause: PullRequestReviewOperationError | ApplicationError | undefined, boundary: BugbotFreshnessBoundary,
    operation: BugbotFreshnessOperation, invalidResponse = false): ApplicationError {
    const provider = cause instanceof PullRequestReviewOperationError ? cause : undefined;
    const semantic = cause instanceof ApplicationError ? cause : undefined;
    const candidate = provider?.providerStatus;
    const status = typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : undefined;
    const invalid = invalidResponse || semantic?.code === 'provider.contract-invalid' || (provider?.providerFailure === 'response-invalid' && status === undefined);
    const reference = provider?.providerReference;
    const diagnostic: BugbotFreshnessDiagnostic = Object.freeze({ operation,
        providerStatus: !invalid && status ? `http-${status}` : 'http-unavailable',
        providerReference: typeof reference === 'string' && /^[A-Za-z0-9:-]{1,64}$/u.test(reference) ? reference : 'unavailable',
        reason: invalid ? 'response-invalid' : 'provider-request-failed' });
    return new ApplicationError(semantic?.code ?? (invalid ? 'provider.contract-invalid' : pullRequestReviewProviderCode(status)),
        'Bugbot could not confirm the current pull request identity.', { cause,
            ...(semantic ? { correlationId: semantic.correlationId, retryable: semantic.retryable } : {}), recovery: {
            id: boundary === 'after-publication' ? 'bugbot-freshness-after-publication' : 'bugbot-freshness-before-publication', variables: diagnostic } });
}
