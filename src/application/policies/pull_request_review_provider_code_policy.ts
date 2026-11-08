import type { ApplicationErrorCode } from '../../data/model/application_error';

/** Operates only on the sanitized optional HTTP status from the review port. */
export function pullRequestReviewProviderCode(status: number | undefined): ApplicationErrorCode {
    return status === 401 ? 'authorization.credential-invalid' : status === 403 ? 'authorization.denied'
        : status === 404 ? 'provider.not-found' : status === 409 ? 'provider.conflict'
            : status === 429 ? 'provider.rate-limited' : status === 408 || status === 425 ? 'provider.unavailable'
                : status && status < 500 ? 'provider.contract-invalid' : 'provider.unavailable';
}
