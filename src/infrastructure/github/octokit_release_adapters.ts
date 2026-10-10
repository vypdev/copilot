import { getOctokitClient } from "./octokit_client_resolver";
import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubReleaseClient, GithubRepositoryVersionTagsClient } from "./ports/github_release_provider_ports";

export class OctokitReleaseClientAdapter implements GithubClientPort<GithubReleaseClient> {
    getClient(token: string): GithubReleaseClient { return getOctokitClient<GithubReleaseClient>(token); }
}

export class OctokitRepositoryVersionTagsClientAdapter implements GithubClientPort<GithubRepositoryVersionTagsClient> {
    getClient(token: string): GithubRepositoryVersionTagsClient { return getOctokitClient<GithubRepositoryVersionTagsClient>(token); }
}
