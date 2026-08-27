import { getOctokitClient } from "./octokit_client_resolver";
import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubReleaseClient } from "../../application/ports/github_release_ports";

export class OctokitReleaseClientAdapter implements GithubClientPort<GithubReleaseClient> {
    getClient(token: string): GithubReleaseClient { return getOctokitClient<GithubReleaseClient>(token); }
}
