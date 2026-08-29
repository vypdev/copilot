import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubReleaseClient } from "../../../infrastructure/github/ports/github_release_provider_ports";
import type { RepositoryReleasePublicationPort } from "../../../application/ports/repository_release_ports";
export declare class RepositoryReleasePublicationRepository implements RepositoryReleasePublicationPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubReleaseClient>);
    updateRelease: (owner: string, repository: string, sourceTag: string, targetTag: string, token: string) => Promise<string | undefined>;
    private listReleases;
    createRelease: (owner: string, repository: string, version: string, title: string, changelog: string, token: string) => Promise<string | undefined>;
}
