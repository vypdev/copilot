import type { GithubReleaseClient } from '../../../infrastructure/github/ports/github_release_provider_ports';
export type RepositoryReleaseSummary = {
    id: number;
    tag_name: string;
};
export declare function listRepositoryReleases(client: GithubReleaseClient, owner: string, repository: string): Promise<RepositoryReleaseSummary[]>;
