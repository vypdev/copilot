import { ApplicationError, type ApplicationErrorCode } from '../../../application/errors/application_error';
import { ChangeSizeProviderError } from '../../../application/ports/change_size_provider_error';
import { getGithubErrorStatus, isGithubRateLimited } from './github_error_policy';

/** Terminates SDK/transport exceptions before they enter the size application workflow. */
export async function withChangeSizeProviderFailure<T>(perform: () => Promise<T>): Promise<T> {
    try { return await perform(); } catch (cause) {
        if (cause instanceof ChangeSizeProviderError) throw cause;
        const record = object(cause);
        const response = object(record.response);
        const headers = object(response.headers ?? record.headers);
        const rawStatus = getGithubErrorStatus(cause);
        const status = typeof rawStatus === 'number' && Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : undefined;
        const types = Array.isArray(record.errors) ? record.errors.map(error => object(error).type) : [];
        const code: ApplicationErrorCode = cause instanceof ApplicationError ? cause.code
            : isGithubRateLimited(cause) || types.includes('RATE_LIMITED') ? 'provider.rate-limited'
                : status === 401 ? 'authorization.credential-invalid'
                    : status === 403 || types.includes('FORBIDDEN') || types.includes('UNAUTHORIZED') ? 'authorization.denied'
                        : status === 404 || types.includes('NOT_FOUND') ? 'provider.not-found'
                            : status === 409 || status === 412 ? 'provider.conflict'
                                : status === 400 || status === 422 ? 'provider.contract-invalid'
                                    : status === 408 || typeof status === 'number' && status >= 500 && status <= 599
                                        || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(String(record.code))
                                        || types.includes('INTERNAL') || types.includes('SERVICE_UNAVAILABLE')
                                        ? 'provider.unavailable' : types.length > 0 ? 'provider.contract-invalid' : 'unexpected';
        const referenceKey = Object.keys(headers).find(key => key.toLowerCase() === 'x-github-request-id');
        const reference = referenceKey ? headers[referenceKey] : undefined;
        throw new ChangeSizeProviderError(code,
            typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? `http-${status}` : 'http-unavailable',
            typeof reference === 'string' && /^[A-Za-z0-9:-]{1,64}$/u.test(reference) ? reference : 'unavailable',
            cause instanceof ApplicationError ? { retryable: cause.retryable, correlationId: cause.correlationId } : {});
    }
}

function object(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
