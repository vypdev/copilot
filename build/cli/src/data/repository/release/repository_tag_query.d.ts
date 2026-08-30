import type { GithubReleaseClient } from '../../../infrastructure/github/ports/github_release_provider_ports';
export type RepositoryTagRef = {
    object: {
        sha: string;
    };
};
export declare function findRepositoryTag(client: GithubReleaseClient, owner: string, repository: string, tag: string): Promise<RepositoryTagRef | undefined>;
export declare function getRepositoryTagSha(client: GithubReleaseClient, owner: string, repository: string, tag: string): Promise<string | undefined>;
