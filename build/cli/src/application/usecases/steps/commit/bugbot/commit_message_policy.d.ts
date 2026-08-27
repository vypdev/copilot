/** Maximum length of one finding ID in a commit message. */
export declare const MAX_FINDING_ID_LENGTH_COMMIT = 80;
/** Maximum length of the finding IDs segment in a commit message. */
export declare const MAX_FINDING_IDS_PART_LENGTH = 500;
export declare function sanitizeFindingIdForCommitMessage(id: string): string;
export declare function buildFindingIdsPartForCommit(targetFindingIds: string[]): string;
export declare function buildBugbotCommitMessage(issueNumber: number, targetFindingIds: string[]): string;
export declare function buildUserRequestCommitMessage(issueNumber: number): string;
