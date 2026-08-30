export interface LinkedBranchRepositorySnapshot {
    id?: string | null;
    issue?: { id?: string | null } | null;
    ref?: { target?: { oid?: string | null } | null } | null;
}

export interface LinkedBranchIdentifiers {
    repositoryId: string;
    issueId: string;
    branchOid: string;
}

export function qualifyLinkedBranchRef(baseBranchName: string): string {
    return baseBranchName.startsWith('tags/')
        ? `refs/${baseBranchName}`
        : `refs/heads/${baseBranchName}`;
}

export function resolveLinkedBranchIdentifiers(
    repository: LinkedBranchRepositorySnapshot | null | undefined,
    oid: string | undefined,
): LinkedBranchIdentifiers | undefined {
    const repositoryId = repository?.id;
    const issueId = repository?.issue?.id;
    const branchOid = oid ?? repository?.ref?.target?.oid;
    if (!repositoryId || !issueId || !branchOid) return undefined;
    return { repositoryId, issueId, branchOid };
}

export function isExpectedLinkedBranchRef(refName: string | null | undefined, expectedName: string): boolean {
    const normalizedName = refName?.replace(/^refs\/heads\//, '').replace(/^\/+/, '');
    return normalizedName === expectedName;
}
