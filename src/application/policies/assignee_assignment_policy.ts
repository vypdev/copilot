export interface AssigneeAssignmentContext {
    isIssue: boolean;
    isPullRequest: boolean;
    issue: { number: number; desiredAssigneesCount: number; creator: string };
    pullRequest: { number: number; desiredAssigneesCount: number; creator: string };
}

export interface AssigneeTarget {
    number: number;
    desiredCount: number;
}

export interface CreatorAssignment {
    login: string;
    source: 'issue' | 'pull request';
}

export function resolveAssigneeTarget(context: AssigneeAssignmentContext): AssigneeTarget {
    return context.isIssue
        ? { number: context.issue.number, desiredCount: context.issue.desiredAssigneesCount }
        : { number: context.pullRequest.number, desiredCount: context.pullRequest.desiredAssigneesCount };
}

function isEligibleCreator(creator: string, projectMembers: string[], currentMembers: string[]): boolean {
    if (!creator) return false;
    const identity = creator.toLowerCase();
    return projectMembers.some((member) => member.toLowerCase() === identity)
        && !currentMembers.some((member) => member.toLowerCase() === identity);
}

export function resolveCreatorAssignment(
    context: AssigneeAssignmentContext,
    projectMembers: string[],
    currentMembers: string[],
): CreatorAssignment | undefined {
    if (context.isPullRequest && context.pullRequest.creator && isEligibleCreator(context.pullRequest.creator, projectMembers, currentMembers)) {
        return { login: context.pullRequest.creator, source: 'pull request' };
    }
    if (context.isIssue && isEligibleCreator(context.issue.creator, projectMembers, currentMembers)) {
        return { login: context.issue.creator, source: 'issue' };
    }
    return undefined;
}

export function calculateRemainingAssignees(
    desiredCount: number,
    currentCount: number,
    creatorAssigned: boolean,
): number {
    return desiredCount - currentCount - (creatorAssigned ? 1 : 0);
}

export function selectConfirmedAssignees(requestedMembers: string[], assignedMembers: string[]): string[] {
    const requestedIdentities = new Set(requestedMembers.map((member) => member.toLowerCase()));
    return assignedMembers.filter((member) => requestedIdentities.has(member.toLowerCase()));
}
