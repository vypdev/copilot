import type { GithubReleaseClient } from '../../../infrastructure/github/ports/github_release_provider_ports';

export type RepositoryReleaseSummary = { id: number; tag_name: string };

export async function listRepositoryReleases(
    client: GithubReleaseClient,
    owner: string,
    repository: string,
): Promise<RepositoryReleaseSummary[]> {
    const releases: RepositoryReleaseSummary[] = [];
    const maximumPages = 100;
    for (let page = 1; page <= maximumPages; page += 1) {
        const { data } = await client.rest.repos.listReleases({ owner, repo: repository, per_page: 100, page });
        releases.push(...(data ?? []));
        if ((data ?? []).length < 100) return releases;
    }
    throw new Error(`Release pagination exceeded ${maximumPages} pages.`);
}
