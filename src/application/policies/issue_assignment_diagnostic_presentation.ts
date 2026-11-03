import type { ApplicationErrorCode } from '../../data/model/application_error';
import type { IssueAssignmentDiagnostic, AssignmentOperation, AssignmentStage } from '../../domain/issue_assignment_diagnostic';
import type { ApplicationErrorMessageReader } from './application_error_message_catalog';

import type { ENGLISH_ASSIGNMENT_LABELS } from './issue_assignment_messages';

const STAGES: Record<AssignmentStage, keyof typeof ENGLISH_ASSIGNMENT_LABELS> = {
    'read-assignees': 'assignmentRead', 'lookup-members': 'assignmentLookup', 'select-members': 'assignmentSelect',
    'assign-creator': 'assignmentCreator', 'assign-members': 'assignmentMembers',
};
const OPERATIONS: Record<AssignmentOperation, keyof typeof ENGLISH_ASSIGNMENT_LABELS> = {
    'read-assignees': 'assignmentReadOperation', 'list-teams': 'assignmentTeams', 'list-team-members': 'assignmentTeamMembers',
    'add-assignees': 'assignmentAdd', 'initialize-client': 'assignmentClient', unavailable: 'assignmentUnavailable',
};

export function assignmentDiagnosticPresentation(facts: IssueAssignmentDiagnostic, code: ApplicationErrorCode, message: ApplicationErrorMessageReader) {
    return { ...facts,
        stage: message(`error.label.${STAGES[facts.stage]}`), operation: message(`error.label.${OPERATIONS[facts.operation]}`),
        providerStatus: facts.providerStatus === 'http-unavailable' ? message('error.label.assignmentUnavailable') : facts.providerStatus,
        assigneeRead: message(facts.assigneeRead === 'verified' ? 'error.label.assignmentReadVerified' : 'error.label.assignmentUnavailable'),
        remainingAssignments: facts.assigneeRead === 'verified' ? facts.remainingAssignments : message('error.label.assignmentUnavailable'),
        mutation: message(facts.mutation === 'not-attempted' ? 'error.label.assignmentWriteNone'
            : facts.mutation === 'unverified' ? 'error.label.assignmentWriteUnverified' : 'error.label.assignmentWriteVerified'),
        guidance: code.startsWith('authorization.') || code === 'provider.not-found'
            ? message('error.label.assignmentAccess') : message(`error.${code}.action`),
    };
}
