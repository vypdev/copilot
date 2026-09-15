import { ApplicationError as SemanticApplicationError, type ApplicationErrorCode, type SemanticApplicationErrorOptions } from '../../data/model/application_error';
export { APPLICATION_ERROR_METADATA, APPLICATION_ERROR_RECOVERY_IDS, type ApplicationErrorCode, type ApplicationErrorKind, type ApplicationErrorPublicRecord, type ApplicationErrorRecovery, type ApplicationErrorRecoveryId, } from '../../data/model/application_error';
export interface ApplicationErrorOptions extends Omit<SemanticApplicationErrorOptions, 'correlationId'> {
    readonly correlationId?: string;
}
/** Creates a semantic error and owns correlation identity outside the pure model. */
export declare class ApplicationError extends SemanticApplicationError {
    constructor(code: ApplicationErrorCode, message: string, options?: ApplicationErrorOptions);
}
export declare function toApplicationError(error: unknown, code: ApplicationErrorCode, message: string, options?: Omit<ApplicationErrorOptions, 'cause'>): ApplicationError;
