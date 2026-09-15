import { ApplicationError } from '../../application/errors/application_error';
import type { PublicationSourceQueryPort } from '../../application/ports/publication_freshness_ports';
import { canonicalGitObjectId } from '../../domain/git_object_id';
import type { GithubBranchClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';

/** Reads the authoritative branch head without exposing Octokit to application code. */
export class GithubPublicationSourceRepository implements PublicationSourceQueryPort {
    constructor(private readonly clientProvider: GithubClientPort<GithubBranchClient>) {}

    async getBranchHeadSha(owner: string, repository: string, branch: string, token: string): Promise<string> {
        const { data } = await this.clientProvider.getClient(token).rest.git.getRef({
            owner,
            repo: repository,
            ref: `heads/${branch}`,
        });
        const sha = canonicalGitObjectId(data.object?.sha);
        if (!sha) {
            throw new ApplicationError(
                'provider.contract-invalid',
                'GitHub returned an invalid branch-head object ID.',
            );
        }
        return sha;
    }
}
