import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubReleaseClient } from "../../../infrastructure/github/ports/github_release_provider_ports";
import { logDebugInfo, logError } from "../../../utils/logger";
import type { RepositoryDefaultBranchPort } from "../../../application/ports/repository_release_ports";

export class RepositoryDefaultBranchRepository implements RepositoryDefaultBranchPort {
    constructor(private readonly githubClient: GithubClientPort<GithubReleaseClient>) {}

    getDefaultBranch = async (
        owner: string,
        repository: string,
        token: string,
    ): Promise<string | undefined> => {
        try {
            const octokit = this.githubClient.getClient(token);
            const { data } = await octokit.rest.repos.get({ owner, repo: repository });
            logDebugInfo(`Default branch for ${owner}/${repository}: ${data.default_branch}`);
            return data.default_branch;
        } catch (error) {
            logError(`Error getting default branch for ${owner}/${repository}: ${error}`);
            throw error;
        }
    };
}
