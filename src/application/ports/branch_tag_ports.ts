export interface LatestTagQueryPort {
    getLatestTag(): Promise<string | undefined>;
}

export interface RepositoryVersionTagsQueryPort {
    getLatestTag(owner: string, repository: string, token: string): Promise<string | undefined>;
}
