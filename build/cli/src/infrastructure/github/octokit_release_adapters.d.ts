import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubReleaseClient } from "./ports/github_release_provider_ports";
export declare class OctokitReleaseClientAdapter implements GithubClientPort<GithubReleaseClient> {
    getClient(token: string): GithubReleaseClient;
}
