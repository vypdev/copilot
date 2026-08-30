export interface LinkedBranchRepositorySnapshot {
    id?: string | null;
    issue?: {
        id?: string | null;
    } | null;
    ref?: {
        target?: {
            oid?: string | null;
        } | null;
    } | null;
}
export interface LinkedBranchIdentifiers {
    repositoryId: string;
    issueId: string;
    branchOid: string;
}
export declare function qualifyLinkedBranchRef(baseBranchName: string): string;
export declare function resolveLinkedBranchIdentifiers(repository: LinkedBranchRepositorySnapshot | null | undefined, oid: string | undefined): LinkedBranchIdentifiers | undefined;
export declare function isExpectedLinkedBranchRef(refName: string | null | undefined, expectedName: string): boolean;
