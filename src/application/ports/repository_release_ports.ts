export interface RepositoryTagPort {
    updateTag(owner: string, repository: string, sourceTag: string, targetTag: string, token: string): Promise<void>;
    createTag(owner: string, repository: string, branch: string, tag: string, token: string): Promise<string | undefined>;
    createOrVerifyTagAtSha(owner: string, repository: string, sha: string, tag: string, token: string): Promise<string>;
}

export interface RepositoryReleasePublicationPort {
    updateRelease(owner: string, repository: string, sourceTag: string, targetTag: string, token: string): Promise<string | undefined>;
    createRelease(
        owner: string,
        repository: string,
        version: string,
        title: string,
        changelog: string,
        operationId: string,
        productionSha: string,
        token: string,
    ): Promise<string | undefined>;
}

export interface RepositoryDefaultBranchPort {
    getDefaultBranch(owner: string, repository: string, token: string): Promise<string | undefined>;
}

/** Repository-credential-bound tag authority for release/setup capabilities. */
export interface BoundRepositoryTagPort {
    updateTag(sourceTag: string, targetTag: string): Promise<void>;
    createTag(branch: string, tag: string): Promise<string | undefined>;
    createOrVerifyTagAtSha(sha: string, tag: string): Promise<string>;
}

/** Repository-credential-bound release publication authority. */
export interface BoundRepositoryReleasePublicationPort {
    updateRelease(sourceTag: string, targetTag: string): Promise<string | undefined>;
    createRelease(
        version: string,
        title: string,
        changelog: string,
        operationId: string,
        productionSha: string,
    ): Promise<string | undefined>;
}

export interface BoundRepositoryDefaultBranchPort {
    getDefaultBranch(): Promise<string | undefined>;
}
