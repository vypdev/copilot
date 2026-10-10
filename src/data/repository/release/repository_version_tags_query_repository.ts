import type { RepositoryVersionTagsQueryPort } from '../../../application/ports/branch_tag_ports';
import { ApplicationError } from '../../../application/errors/application_error';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubRepositoryVersionTagsClient } from '../../../infrastructure/github/ports/github_release_provider_ports';
import { getLatestVersion } from '../../model/version_policy';

/** Remote-only setup query: never fetches or rewrites local moving Action tags. */
export class RepositoryVersionTagsQueryRepository implements RepositoryVersionTagsQueryPort {
    constructor(private readonly githubClient: GithubClientPort<GithubRepositoryVersionTagsClient>) {}

    async getLatestTag(owner: string, repository: string, token: string): Promise<string | undefined> {
        const client = this.githubClient.getClient(token);
        const versions: string[] = [];
        for (let page = 1; page <= 100; page += 1) {
            const { data } = await client.rest.repos.listTags({ owner, repo: repository, per_page: 100, page });
            if (!Array.isArray(data) || data.some(tag => !tag || typeof tag.name !== 'string')) {
                throw new ApplicationError('provider.contract-invalid', 'GitHub returned an invalid version-tag inventory. No initial tag was created.');
            }
            for (const tag of data) {
                const match = /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag.name);
                if (match && match[1].split('.').every(part => Number.isSafeInteger(Number(part)))) versions.push(match[1]);
            }
            if (data.length < 100) return getLatestVersion(versions);
        }
        throw new ApplicationError('provider.contract-invalid', 'GitHub version-tag inventory exceeded the setup inspection limit. No initial tag was created.');
    }
}
