export interface AssigneeAssignmentContext {
    readonly target: 'issue' | 'pull request';
    readonly number: number;
    readonly desiredAssigneesCount: number;
    readonly creator: string;
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
    return { number: context.number, desiredCount: context.desiredAssigneesCount };
}

export function isValidAssigneeCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10;
}

function isEligibleCreator(creator: string, projectMembers: readonly string[], currentMembers: readonly string[]): boolean {
    if (!creator) return false;
    const identity = creator.toLowerCase();
    return projectMembers.some((member) => member.toLowerCase() === identity)
        && !currentMembers.some((member) => member.toLowerCase() === identity);
}

export function resolveCreatorAssignment(
    context: AssigneeAssignmentContext,
    projectMembers: readonly string[],
    currentMembers: readonly string[],
): CreatorAssignment | undefined {
    if (isEligibleCreator(context.creator, projectMembers, currentMembers)) {
        return { login: context.creator, source: context.target };
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

export function selectConfirmedAssignees(requestedMembers: readonly string[], assignedMembers: readonly string[]): string[] {
    const requestedIdentities = new Set(requestedMembers.map((member) => member.toLowerCase()));
    return [...new Map(assignedMembers.filter((member) => requestedIdentities.has(member.toLowerCase()))
        .map(member => [member.toLowerCase(), member])).values()];
}
