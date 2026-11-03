export const ASSIGNMENT_STAGES = Object.freeze(['read-assignees', 'lookup-members', 'select-members', 'assign-creator', 'assign-members'] as const);
export const ASSIGNMENT_OPERATIONS = Object.freeze(['read-assignees', 'list-teams', 'list-team-members', 'add-assignees', 'initialize-client', 'unavailable'] as const);
export type AssignmentStage = typeof ASSIGNMENT_STAGES[number];
export type AssignmentOperation = typeof ASSIGNMENT_OPERATIONS[number];

/** Counts describe only this assignment attempt; other lifecycle results remain independent. */
export interface IssueAssignmentDiagnostic {
    readonly targetNumber: number;
    readonly desiredCount: number;
    readonly stage: AssignmentStage;
    readonly operation: AssignmentOperation;
    readonly providerStatus: string;
    readonly assigneeRead: 'verified' | 'unavailable';
    readonly observedAssignees: number | 'unavailable';
    readonly confirmedAssignments: number;
    readonly remainingAssignments: number | 'unavailable';
    readonly mutation: 'not-attempted' | 'unverified' | 'verified';
}

export function isAssignmentProviderStatus(value: unknown): value is string {
    return typeof value === 'string' && (value === 'http-unavailable' || /^http-[1-5][0-9]{2}$/u.test(value));
}

export function isIssueAssignmentDiagnostic(value: Readonly<Record<string, unknown>>): boolean {
    return Number.isSafeInteger(value.targetNumber) && Number(value.targetNumber) > 0
        && Number.isInteger(value.desiredCount) && Number(value.desiredCount) >= 1 && Number(value.desiredCount) <= 10
        && ASSIGNMENT_STAGES.includes(value.stage as AssignmentStage)
        && ASSIGNMENT_OPERATIONS.includes(value.operation as AssignmentOperation)
        && isAssignmentProviderStatus(value.providerStatus)
        && ['verified', 'unavailable'].includes(value.assigneeRead as string)
        && ['not-attempted', 'unverified', 'verified'].includes(value.mutation as string)
        && validCount(value.confirmedAssignments) && Number(value.confirmedAssignments) <= Number(value.desiredCount)
        && (value.mutation !== 'not-attempted' || value.confirmedAssignments === 0)
        && (value.mutation !== 'verified' || Number(value.confirmedAssignments) > 0)
        && (value.assigneeRead === 'unavailable'
            ? value.observedAssignees === 'unavailable' && value.remainingAssignments === 'unavailable'
                && value.confirmedAssignments === 0 && value.mutation === 'not-attempted' && value.stage === 'read-assignees'
            : validCount(value.observedAssignees) && validCount(value.remainingAssignments)
                && value.remainingAssignments === Math.max(0, Number(value.desiredCount) - Number(value.observedAssignees) - Number(value.confirmedAssignments)));
}

function validCount(value: unknown): boolean {
    return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 10;
}
