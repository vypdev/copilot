import type { IssueInactivityQueryPort } from '../../../application/ports/issue_inactivity_ports';
import type { IssueActivitySnapshot } from '../../../domain/issue_inactivity';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueActivity, GithubIssueInactivityClient } from '../../../infrastructure/github/ports/github_issue_provider_ports';
import { requireArrayPage } from '../github/github_pagination_policy';

/** Reads the provider's issue activity timestamp and waiting-state labels. */
export class IssueInactivityRepository implements IssueInactivityQueryPort {
    constructor(private readonly githubClient: GithubClientPort<GithubIssueInactivityClient>) {}

    listOpenIssuesByLabel = async (
        owner: string,
        repository: string,
        label: string,
        token: string,
    ): Promise<readonly IssueActivitySnapshot[]> => {
        const client = this.githubClient.getClient(token);
        const issues: IssueActivitySnapshot[] = [];
        for await (const response of client.paginate.iterator(
            client.rest.issues.listForRepo,
            {
                owner,
                repo: repository,
                state: 'open',
                labels: label,
                sort: 'updated',
                direction: 'asc',
                per_page: 100,
            },
        )) {
            const page = requireArrayPage<GithubIssueActivity>(response.data, 'open issues');
            issues.push(...page.map(toSnapshot));
        }
        return issues;
    };

    getOpenIssue = async (
        owner: string,
        repository: string,
        issueNumber: number,
        token: string,
    ): Promise<IssueActivitySnapshot | undefined> => {
        const client = this.githubClient.getClient(token);
        const response = await client.rest.issues.get({
            owner,
            repo: repository,
            issue_number: issueNumber,
        });
        if (response.data.state !== 'open') return undefined;
        return toSnapshot(response.data);
    };
}

function toSnapshot(issue: GithubIssueActivity): IssueActivitySnapshot {
    if (!Number.isSafeInteger(issue.number) || issue.number < 1) {
        throw new Error('GitHub issue response contained an invalid issue number.');
    }
    return {
        number: issue.number,
        updatedAt: issue.updated_at ?? undefined,
        isPullRequest: issue.pull_request !== undefined,
        labels: (issue.labels ?? []).flatMap(label => {
            const name = typeof label === 'string' ? label : label.name;
            return name?.trim() ? [name] : [];
        }),
    };
}
