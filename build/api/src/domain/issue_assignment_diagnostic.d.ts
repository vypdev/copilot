export declare const ASSIGNMENT_STAGES: readonly ["read-assignees", "lookup-members", "select-members", "assign-creator", "assign-members"];
export declare const ASSIGNMENT_OPERATIONS: readonly ["read-assignees", "list-teams", "list-team-members", "add-assignees", "initialize-client", "unavailable"];
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
export declare function isAssignmentProviderStatus(value: unknown): value is string;
export declare function isIssueAssignmentDiagnostic(value: Readonly<Record<string, unknown>>): boolean;
