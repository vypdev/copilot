import type { GithubReleaseClient } from '../../../infrastructure/github/ports/github_release_provider_ports';
import { isGithubNotFound } from '../github/github_error_policy';
import { tagReference } from '../release_tag_policy';

export type RepositoryTagRef = { object: { sha: string; type?: string } };

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
    const reference = await findRepositoryTag(client, owner, repository, tag);
    if (!reference) return undefined;
    let object = reference.object;
    for (let depth = 0; object.type === 'tag' && depth < 5; depth += 1) {
        const response = await client.rest.git.getTag({ owner, repo: repository, tag_sha: object.sha });
        object = response.data.object;
    }
    if (object.type === 'tag') throw new Error(`Tag '${tag}' has an unsupported annotation depth.`);
    return object.sha;
}
