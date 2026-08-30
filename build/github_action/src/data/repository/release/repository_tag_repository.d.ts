import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubReleaseClient } from "../../../infrastructure/github/ports/github_release_provider_ports";
import type { RepositoryTagPort } from "../../../application/ports/repository_release_ports";
export declare class RepositoryTagRepository implements RepositoryTagPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubReleaseClient>);
    updateTag: (owner: string, repository: string, sourceTag: string, targetTag: string, token: string) => Promise<void>;
    createTag: (owner: string, repository: string, branch: string, tag: string, token: string) => Promise<string | undefined>;
}
