import { ApplicationError, type ApplicationErrorCode } from '../errors/application_error';
import { ASSIGNMENT_OPERATIONS, isAssignmentProviderStatus, type AssignmentOperation } from '../../domain/issue_assignment_diagnostic';

/** Sanitized adapter evidence. Provider messages, bodies, member lists and credentials are discarded. */
export class AssignmentProviderError extends ApplicationError {
    constructor(code: ApplicationErrorCode, readonly operation: AssignmentOperation, readonly providerStatus: string,
        options: { readonly retryable?: boolean; readonly correlationId?: string } = {}) {
        super(code, 'The assignment provider operation failed.', options);
        if (!ASSIGNMENT_OPERATIONS.includes(operation) || !isAssignmentProviderStatus(providerStatus)) {
            throw new TypeError('Assignment provider evidence is invalid.');
        }
    }
}
