import { ApplicationError } from '../../application/errors/application_error';
import { isIssueAssignmentDiagnostic, isAssignmentProviderStatus, type IssueAssignmentDiagnostic } from '../issue_assignment_diagnostic';

const assignmentFacts: IssueAssignmentDiagnostic = {
    targetNumber: 17, desiredCount: 3, stage: 'lookup-members', operation: 'list-teams', providerStatus: 'http-403',
    assigneeRead: 'verified', observedAssignees: 1, confirmedAssignments: 0, remainingAssignments: 2, mutation: 'not-attempted',
};

describe('bounded issue assignment diagnostics', () => {
    it('copies and freezes the complete public descriptor without raw error data', () => {
        const facts = { ...assignmentFacts };
        const error = new ApplicationError('authorization.denied', 'Safe assignment error.', { recovery: { id: 'issue-assignment-failed', variables: facts } });
        facts.stage = 'select-members';
        expect(error.recovery?.variables).toEqual(assignmentFacts);
        expect(Object.isFrozen(error.recovery?.variables)).toBe(true);
        expect(error.toJSON().recovery).toEqual({ id: 'issue-assignment-failed', variables: assignmentFacts });
    });

    it.each([
        { targetNumber: 0 }, { targetNumber: 1.5 }, { targetNumber: Number.MAX_SAFE_INTEGER + 1 },
        { desiredCount: 0 }, { desiredCount: 11 }, { desiredCount: 1.5 },
        { stage: 'private-token' }, { operation: 'private-token' }, { providerStatus: 'http-600' },
        { providerStatus: 'private-token' }, { providerStatus: 403 },
        { assigneeRead: 'maybe' }, { mutation: 'private-token' },
        { observedAssignees: -1 }, { observedAssignees: 11 }, { confirmedAssignments: 0.5 },
        { remainingAssignments: 11 }, { remainingAssignments: 1 },
        { confirmedAssignments: 4 }, { confirmedAssignments: 1, remainingAssignments: 1 },
        { mutation: 'verified' },
        { assigneeRead: 'unavailable', stage: 'read-assignees' },
        { assigneeRead: 'unavailable', stage: 'read-assignees', observedAssignees: 'unavailable' },
        { assigneeRead: 'unavailable', stage: 'lookup-members', observedAssignees: 'unavailable', remainingAssignments: 'unavailable' },
        { assigneeRead: 'unavailable', stage: 'read-assignees', observedAssignees: 'unavailable', remainingAssignments: 'unavailable', mutation: 'unverified' },
        { assigneeRead: 'unavailable', stage: 'read-assignees', observedAssignees: 'unavailable', remainingAssignments: 'unavailable', confirmedAssignments: 1, mutation: 'unverified' },
    ])('rejects malformed or contradictory bounded facts (%j)', override => {
        const variables = { ...assignmentFacts, ...override };
        expect(isIssueAssignmentDiagnostic(variables)).toBe(false);
        expect(() => new ApplicationError('unexpected', 'Safe.', { recovery: { id: 'issue-assignment-failed', variables: variables as IssueAssignmentDiagnostic } }))
            .toThrow('Issue assignment diagnostic is invalid.');
    });

    it.each([{ token: 'private-token' }, { rawMessage: 'private-member' }])('rejects extra public fields (%j)', extra => {
        expect(() => new ApplicationError('unexpected', 'Safe.', { recovery: { id: 'issue-assignment-failed', variables: { ...assignmentFacts, ...extra } } }))
            .toThrow('Application error recovery variables are invalid');
    });

    it.each(['http-100', 'http-599', 'http-unavailable'])('accepts safe provider status %s', value => {
        expect(isAssignmentProviderStatus(value)).toBe(true);
        expect(isIssueAssignmentDiagnostic({ ...assignmentFacts, providerStatus: value })).toBe(true);
    });

    it('serializes unread counts as unavailable, without placeholder zero facts', () => {
        const variables = { ...assignmentFacts, stage: 'read-assignees', assigneeRead: 'unavailable', observedAssignees: 'unavailable', remainingAssignments: 'unavailable' } as IssueAssignmentDiagnostic;
        const error = new ApplicationError('provider.unavailable', 'Safe.', { recovery: { id: 'issue-assignment-failed', variables } });
        expect(error.toJSON().recovery?.variables).toMatchObject({ observedAssignees: 'unavailable', remainingAssignments: 'unavailable' });
    });
});
