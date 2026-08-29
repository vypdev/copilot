import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubReleaseClient } from "../../../infrastructure/github/ports/github_release_provider_ports";
import type { RepositoryDefaultBranchPort } from "../../../application/ports/repository_release_ports";
export declare class RepositoryDefaultBranchRepository implements RepositoryDefaultBranchPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubReleaseClient>);
    getDefaultBranch: (owner: string, repository: string, token: string) => Promise<string | undefined>;
}
