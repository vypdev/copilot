import { logDebugInfo, logError } from "../../../utils/logger";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubIssueLabelsClient } from "../../../infrastructure/github/ports/github_issue_provider_ports";
import { requireArrayPage } from "../github/github_pagination_policy";

export class IssueLabelRepository {
    constructor(private readonly githubClient: GithubClientPort<GithubIssueLabelsClient>) {}
    getLabels = async (owner: string, repository: string, issueNumber: number, token: string): Promise<string[]> => {
        if (issueNumber === -1) return [];
        const octokit = this.githubClient.getClient(token);
        try {
            const { data: labels } = await octokit.rest.issues.listLabelsOnIssue({
                owner,
                repo: repository,
                issue_number: issueNumber,
            });
            return requireArrayPage<{ name: string }>(labels, 'issue labels').map(label => label.name);
        } catch (error: unknown) {
            const err = error as { status?: number };
            if (err.status === 404) {
                logDebugInfo(`Issue #${issueNumber} not found or no access; returning empty labels.`);
                return [];
            }
            logError(`Error fetching labels for issue #${issueNumber}: ${error}`);
            throw error;
        }
    };

    setLabels = async (
        owner: string,
        repository: string,
        issueNumber: number,
        labels: string[],
        token: string,
    ): Promise<void> => {
        const octokit = this.githubClient.getClient(token);
        await octokit.rest.issues.setLabels({
            owner,
            repo: repository,
            issue_number: issueNumber,
            labels,
        });
    };
}
