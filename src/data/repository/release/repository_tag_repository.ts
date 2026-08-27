import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubReleaseClient } from "../../../application/ports/github_release_ports";
import { logDebugInfo, logError, logInfo } from "../../../utils/logger";
import { tagReference, tagReferencePath } from "../release_tag_policy";
import type { RepositoryTagPort } from "../../../application/ports/repository_release_ports";

export class RepositoryTagRepository implements RepositoryTagPort {
    constructor(private readonly githubClient: GithubClientPort<GithubReleaseClient>) {}

    private findTag = async (
        owner: string,
        repository: string,
        tag: string,
        token: string,
    ): Promise<{ object: { sha: string } } | undefined> => {
        const octokit = this.githubClient.getClient(token);
        try {
            const { data: foundTag } = await octokit.rest.git.getRef({
                owner,
                repo: repository,
                ref: tagReference(tag),
            });
            return foundTag;
        } catch {
            return undefined;
        }
    };

    private getTagSha = async (
        owner: string,
        repository: string,
        tag: string,
        token: string,
    ): Promise<string | undefined> => {
        const foundTag = await this.findTag(owner, repository, tag, token);
        if (!foundTag) {
            logError(`The '${tag}' tag does not exist in the remote repository`);
            return undefined;
        }
        return foundTag.object.sha;
    };

    updateTag = async (
        owner: string,
        repository: string,
        sourceTag: string,
        targetTag: string,
        token: string,
    ): Promise<void> => {
        const sourceTagSha = await this.getTagSha(owner, repository, sourceTag, token);
        if (!sourceTagSha) {
            logError(`The '${sourceTag}' tag does not exist in the remote repository`);
            return;
        }

        const foundTargetTag = await this.findTag(owner, repository, targetTag, token);
        const octokit = this.githubClient.getClient(token);
        if (foundTargetTag) {
            logDebugInfo(`Updating the '${targetTag}' tag to point to the '${sourceTag}' tag`);
            await octokit.rest.git.updateRef({
                owner,
                repo: repository,
                ref: tagReference(targetTag),
                sha: sourceTagSha,
                force: true,
            });
        } else {
            logDebugInfo(`Creating the '${targetTag}' tag from the '${sourceTag}' tag`);
            await octokit.rest.git.createRef({
                owner,
                repo: repository,
                ref: tagReferencePath(targetTag),
                sha: sourceTagSha,
            });
        }
    };
    createTag = async (
        owner: string,
        repository: string,
        branch: string,
        tag: string,
        token: string,
    ): Promise<string | undefined> => {
        const octokit = this.githubClient.getClient(token);
        try {
            const existingTag = await this.findTag(owner, repository, tag, token);
            if (existingTag) {
                logInfo(`Tag '${tag}' already exists in repository ${owner}/${repository}`);
                return existingTag.object.sha;
            }

            const { data: ref } = await octokit.rest.git.getRef({
                owner,
                repo: repository,
                ref: `heads/${branch}`,
            });
            await octokit.rest.git.createRef({
                owner,
                repo: repository,
                ref: `refs/tags/${tag}`,
                sha: ref.object.sha,
            });
            logInfo(`Created tag '${tag}' in repository ${owner}/${repository} from branch '${branch}'`);
            return ref.object.sha;
        } catch (error) {
            logError(`Error creating tag '${tag}': ${JSON.stringify(error, null, 2)}`);
            return undefined;
        }
    };
}
