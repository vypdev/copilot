import {
    ApplicationError as SemanticApplicationError,
    type ApplicationErrorCode,
    type SemanticApplicationErrorOptions,
} from '../../data/model/application_error';
import { createApplicationErrorCorrelationId, getApplicationErrorCorrelationId } from './application_error_context';

export {
    APPLICATION_ERROR_METADATA,
    type ApplicationErrorCode,
    type ApplicationErrorKind,
    type ApplicationErrorPublicRecord,
} from '../../data/model/application_error';

export interface ApplicationErrorOptions extends Omit<SemanticApplicationErrorOptions, 'correlationId'> {
    readonly correlationId?: string;
}

/** Creates a semantic error and owns correlation identity outside the pure model. */
export class ApplicationError extends SemanticApplicationError {
    constructor(code: ApplicationErrorCode, message: string, options: ApplicationErrorOptions = {}) {
        super(code, message, {
            ...options,
            correlationId: options.correlationId
                ?? getApplicationErrorCorrelationId()
                ?? createApplicationErrorCorrelationId(),
        });
    }
}

export function toApplicationError(
    error: unknown,
    code: ApplicationErrorCode,
    message: string,
    options: Omit<ApplicationErrorOptions, 'cause'> = {},
): ApplicationError {
    return error instanceof ApplicationError
        ? error
        : new ApplicationError(code, message, { ...options, cause: error });
}
