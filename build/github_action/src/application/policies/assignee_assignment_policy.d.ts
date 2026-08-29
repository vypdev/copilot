export interface AssigneeAssignmentContext {
    isIssue: boolean;
    isPullRequest: boolean;
    issue: {
        number: number;
        desiredAssigneesCount: number;
        creator: string;
    };
    pullRequest: {
        number: number;
        desiredAssigneesCount: number;
        creator: string;
    };
}
export interface AssigneeTarget {
    number: number;
    desiredCount: number;
}
export interface CreatorAssignment {
    login: string;
    source: 'issue' | 'pull request';
}
export declare function resolveAssigneeTarget(context: AssigneeAssignmentContext): AssigneeTarget;
export declare function resolveCreatorAssignment(context: AssigneeAssignmentContext, projectMembers: string[], currentMembers: string[]): CreatorAssignment | undefined;
export declare function calculateRemainingAssignees(desiredCount: number, currentCount: number, creatorAssigned: boolean): number;
export declare function selectConfirmedAssignees(requestedMembers: string[], assignedMembers: string[]): string[];
