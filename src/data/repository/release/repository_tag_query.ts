import type { GithubReleaseClient } from '../../../infrastructure/github/ports/github_release_provider_ports';
import { isGithubNotFound } from '../github/github_error_policy';
import { tagReference } from '../release_tag_policy';

export type RepositoryTagRef = { object: { sha: string } };

export async function findRepositoryTag(
    client: GithubReleaseClient,
    owner: string,
    repository: string,
    tag: string,
): Promise<RepositoryTagRef | undefined> {
    try {
        const { data } = await client.rest.git.getRef({ owner, repo: repository, ref: tagReference(tag) });
        return data;
    } catch (error) {
        if (isGithubNotFound(error)) return undefined;
        throw error;
    }
}

export async function getRepositoryTagSha(
    client: GithubReleaseClient,
    owner: string,
    repository: string,
    tag: string,
): Promise<string | undefined> {
    return (await findRepositoryTag(client, owner, repository, tag))?.object.sha;
}
