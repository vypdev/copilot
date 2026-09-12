import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubReleaseClient } from "../../../infrastructure/github/ports/github_release_provider_ports";
import { logDebugInfo, logError, logInfo } from "../../../utils/logger";
import { tagReference, tagReferencePath } from "../release_tag_policy";
import type { RepositoryTagPort } from "../../../application/ports/repository_release_ports";
import { findRepositoryTag, getRepositoryTagSha } from './repository_tag_query';
import { toApplicationError } from '../../../application/errors/application_error';

export class RepositoryTagRepository implements RepositoryTagPort {
    constructor(private readonly githubClient: GithubClientPort<GithubReleaseClient>) {}

    updateTag = async (
        owner: string,
        repository: string,
        sourceTag: string,
        targetTag: string,
        token: string,
    ): Promise<void> => {
        const octokit = this.githubClient.getClient(token);
        const sourceTagSha = await getRepositoryTagSha(octokit, owner, repository, sourceTag);
        if (!sourceTagSha) {
            throw new Error(`The '${sourceTag}' tag does not exist in the remote repository.`);
        }

        const foundTargetTag = await findRepositoryTag(octokit, owner, repository, targetTag);
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
        const verifiedTargetSha = await getRepositoryTagSha(octokit, owner, repository, targetTag);
        if (verifiedTargetSha !== sourceTagSha) {
            throw new Error(`Moving tag '${targetTag}' was not verified at ${sourceTagSha}.`);
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
            const existingTag = await findRepositoryTag(octokit, owner, repository, tag);
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
            logError(toApplicationError(error, 'provider.unavailable', `Unable to create tag '${tag}'.`));
            throw error;
        }
    };

    createOrVerifyTagAtSha = async (
        owner: string,
        repository: string,
        sha: string,
        tag: string,
        token: string,
    ): Promise<string> => {
        const octokit = this.githubClient.getClient(token);
        const existingTag = await findRepositoryTag(octokit, owner, repository, tag);
        if (existingTag) {
            if (existingTag.object.sha !== sha) {
                throw new Error(`Immutable tag '${tag}' exists at ${existingTag.object.sha}, expected ${sha}.`);
            }
            return sha;
        }
        await octokit.rest.git.createRef({
            owner,
            repo: repository,
            ref: `refs/tags/${tag}`,
            sha,
        });
        return sha;
    };
}
