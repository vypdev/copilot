import { ApplicationError } from './application_error';
import { AssignmentProviderError } from '../ports/assignment_provider_error';
import type { IssueAssignmentDiagnostic } from '../../domain/issue_assignment_diagnostic';

/** Add application-owned progress without losing the originating safe category or correlation. */
export function issueAssignmentFailure(cause: unknown,
    facts: Omit<IssueAssignmentDiagnostic, 'operation' | 'providerStatus'>): ApplicationError {
    return new ApplicationError(cause instanceof ApplicationError ? cause.code : 'unexpected', 'Automatic member assignment stopped.', {
        ...(cause instanceof ApplicationError ? { retryable: cause.retryable, correlationId: cause.correlationId } : {}),
        recovery: { id: 'issue-assignment-failed', variables: { ...facts,
            operation: cause instanceof AssignmentProviderError ? cause.operation
                : facts.stage === 'assign-creator' || facts.stage === 'assign-members' ? 'add-assignees'
                    : facts.stage === 'read-assignees' ? 'read-assignees' : 'unavailable',
            providerStatus: cause instanceof AssignmentProviderError ? cause.providerStatus : 'http-unavailable' } },
    });
}
