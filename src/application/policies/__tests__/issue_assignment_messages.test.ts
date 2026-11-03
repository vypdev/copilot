import { ApplicationError } from '../../errors/application_error';
import { buildApplicationErrorPresentation, renderApplicationErrorMarkdown, renderApplicationErrorText } from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';
import type { ApplicationErrorCode } from '../../../data/model/application_error';
import type { IssueAssignmentDiagnostic } from '../../../domain/issue_assignment_diagnostic';

const facts: IssueAssignmentDiagnostic = { targetNumber: 17, desiredCount: 2, stage: 'lookup-members', operation: 'list-teams', providerStatus: 'http-403',
    assigneeRead: 'verified', observedAssignees: 0, confirmedAssignments: 0, remainingAssignments: 2, mutation: 'not-attempted' };

describe.each(['en', 'es'])('assignment diagnostic presentation (%s)', locale => {
    const message = resolveStaticApplicationErrorCatalog(locale).message;
    it.each([
        { code: 'authorization.denied', override: {} },
        { code: 'provider.not-found', override: { providerStatus: 'http-404' } },
        { code: 'provider.unavailable', override: { stage: 'read-assignees', operation: 'read-assignees', providerStatus: 'http-unavailable', assigneeRead: 'unavailable', observedAssignees: 'unavailable', remainingAssignments: 'unavailable' } },
        { code: 'authorization.credential-invalid', override: { operation: 'initialize-client', providerStatus: 'http-401' } },
        { code: 'provider.unavailable', override: { stage: 'select-members', operation: 'list-team-members', providerStatus: 'http-503', confirmedAssignments: 1, remainingAssignments: 1, mutation: 'verified' } },
        { code: 'provider.contract-invalid', override: { stage: 'assign-creator', operation: 'add-assignees', mutation: 'unverified' } },
        { code: 'unexpected', override: { stage: 'assign-members', operation: 'unavailable', providerStatus: 'http-unavailable', mutation: 'unverified' } },
    ])('renders complete safe progress and recovery for $code/$override', ({ code, override }) => {
        const error = new ApplicationError(code as ApplicationErrorCode, 'Safe message.', { recovery: { id: 'issue-assignment-failed', variables: { ...facts, ...override } as IssueAssignmentDiagnostic } });
        const view = buildApplicationErrorPresentation(error, message);
        const text = renderApplicationErrorText(error, message), markdown = renderApplicationErrorMarkdown(error, message);
        expect(view.impact).toContain('#17');
        expect(view.action.length).toBeGreaterThan(50);
        expect(view.retainedState).toContain(String(override.confirmedAssignments ?? 0));
        expect(view.reference).toBe(error.correlationId);
        expect(view.code).toBe(code);
        expect(view.retryable).toBe(message(error.retryable ? 'error.label.yes' : 'error.label.no'));
        expect(text).toContain(view.retainedState);
        expect(markdown).toContain(view.impact);
        expect(text + markdown).not.toMatch(/\{\w+\}|private-token|private-org|private-member/);
        if (override.assigneeRead === 'unavailable') expect(view.retainedState).toContain(message('error.label.assignmentUnavailable'));
        if (code === 'provider.not-found') expect(view.action).toContain('404');
        expect(error.toJSON().retainedState).toContain('independently completed effects');
    });
});
