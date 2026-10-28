import { CopilotEvidencePublicationError, type CopilotEvidenceFailureCode } from '../../../application/ports/copilot_evidence_error';
import { isGithubRateLimited } from './github_error_policy';

/** Read selected SDK metadata once; discard the provider exception instead of retaining a private cause. */
export function copilotEvidenceProviderFailure(cause: unknown, credential: string): CopilotEvidencePublicationError {
    if (cause instanceof CopilotEvidencePublicationError) return cause;
    const error = record(cause), response = record(error.response), headers = record(response.headers ?? error.headers);
    const status = [error.status, response.status].find(value => typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) as number | undefined;
    const key = Object.keys(headers).find(name => name.toLowerCase() === 'x-github-request-id');
    const reference = key ? headers[key] : undefined;
    const safeReference = typeof reference === 'string' && credential.length > 0 && reference.includes(credential) ? undefined : reference;
    const code: CopilotEvidenceFailureCode = isGithubRateLimited({ status, response: { headers }, message: error.message }) ? 'provider.rate-limited'
            : status === 401 ? 'authorization.credential-invalid'
                : status === 403 ? 'authorization.denied'
                    : status === 404 ? 'provider.not-found'
                        : status === 400 || status === 422 ? 'provider.contract-invalid'
                            : status === 409 || status === 412 ? 'provider.conflict'
                                : status === 408 || typeof status === 'number' && status >= 500
                                    || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code as string)
                                    ? 'provider.unavailable' : 'unexpected';
    return new CopilotEvidencePublicationError(code, status, safeReference);
}
function record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
