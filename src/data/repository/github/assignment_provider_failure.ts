import { ApplicationError, type ApplicationErrorCode } from '../../../application/errors/application_error';
import { AssignmentProviderError } from '../../../application/ports/assignment_provider_error';
import type { AssignmentOperation } from '../../../domain/issue_assignment_diagnostic';
import { isGithubRateLimited } from './github_error_policy';

/** Terminate untrusted REST/transport failures at the adapter boundary, without retaining the cause. */
export async function withAssignmentProviderFailure<T>(operation: AssignmentOperation, perform: () => Promise<T>): Promise<T> {
    try { return await perform(); } catch (cause) {
        if (cause instanceof AssignmentProviderError) throw cause;
        const error = record(cause), response = record(error.response);
        const status = [error.status, response.status].find(value => typeof value === 'number'
            && Number.isInteger(value) && value >= 100 && value <= 599) as number | undefined;
        const code: ApplicationErrorCode = cause instanceof ApplicationError ? cause.code
            : isGithubRateLimited({ status, response: { headers: response.headers ?? error.headers }, message: error.message }) ? 'provider.rate-limited'
                : status === 401 ? 'authorization.credential-invalid'
                    : status === 403 ? 'authorization.denied'
                        : status === 404 ? 'provider.not-found'
                            : status === 409 || status === 412 ? 'provider.conflict'
                                : status === 400 || status === 422 ? 'provider.contract-invalid'
                                    : status === 408 || typeof status === 'number' && status >= 500
                                        || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code as string)
                                        ? 'provider.unavailable' : 'unexpected';
        throw new AssignmentProviderError(code, operation, status === undefined ? 'http-unavailable' : `http-${status}`,
            cause instanceof ApplicationError ? { retryable: cause.retryable, correlationId: cause.correlationId } : {});
    }
}

function record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
