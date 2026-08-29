export function uniqueLogins(logins: string[]): string[] {
    const identities = new Map<string, string>();
    for (const login of logins) {
        const identity = login.toLowerCase();
        if (!identities.has(identity)) identities.set(identity, login);
    }
    return [...identities.values()];
}

export function buildReviewerExclusions(
    creator: string,
    currentReviewers: string[],
    currentAssignees: string[],
): string[] {
    return [creator, ...currentReviewers, ...currentAssignees];
}

export function selectEligibleReviewers(
    members: string[],
    exclusions: string[],
    requiredCount: number,
): string[] {
    const excludedIdentities = new Set(exclusions.map((login) => login.toLowerCase()));
    return uniqueLogins(members)
        .filter((member) => !excludedIdentities.has(member.toLowerCase()))
        .slice(0, requiredCount);
}

export function selectConfirmedReviewers(
    requestedMembers: string[],
    confirmedMembers: string[],
): string[] {
    const requestedIdentities = new Set(requestedMembers.map((member) => member.toLowerCase()));
    const confirmedIdentities = new Set<string>();

    return confirmedMembers.filter((member) => {
        const identity = member.toLowerCase();
        if (!requestedIdentities.has(identity) || confirmedIdentities.has(identity)) return false;
        confirmedIdentities.add(identity);
        return true;
    });
}

export function calculateReviewersStillNeeded(
    desiredCount: number,
    currentCount: number,
    confirmedCount: number,
): number {
    return Math.max(desiredCount - currentCount - confirmedCount, 0);
}
