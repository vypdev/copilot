export interface RepositoryTagPort {
    updateTag(owner: string, repository: string, sourceTag: string, targetTag: string, token: string): Promise<void>;
    createTag(owner: string, repository: string, branch: string, tag: string, token: string): Promise<string | undefined>;
}

export interface RepositoryReleasePublicationPort {
    updateRelease(owner: string, repository: string, sourceTag: string, targetTag: string, token: string): Promise<string | undefined>;
    createRelease(owner: string, repository: string, version: string, title: string, changelog: string, token: string): Promise<string | undefined>;
}

export interface RepositoryDefaultBranchPort {
    getDefaultBranch(owner: string, repository: string, token: string): Promise<string | undefined>;
}
