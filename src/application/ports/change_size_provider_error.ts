import { ApplicationError, type ApplicationErrorCode } from '../errors/application_error';

/** Adapter-owned, sanitized failure evidence; never carries a public provider body. */
export class ChangeSizeProviderError extends ApplicationError {
    constructor(code: ApplicationErrorCode, readonly providerStatus: string, readonly providerReference: string,
        options: { readonly retryable?: boolean; readonly correlationId?: string } = {}) {
        super(code, 'The size provider operation failed.', options);
    }
}
