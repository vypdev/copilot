export declare function uniqueLogins(logins: string[]): string[];
export declare function buildReviewerExclusions(creator: string, currentReviewers: string[], currentAssignees: string[]): string[];
export declare function selectEligibleReviewers(members: string[], exclusions: string[], requiredCount: number): string[];
export declare function selectConfirmedReviewers(requestedMembers: string[], confirmedMembers: string[]): string[];
export declare function calculateReviewersStillNeeded(desiredCount: number, currentCount: number, confirmedCount: number): number;
