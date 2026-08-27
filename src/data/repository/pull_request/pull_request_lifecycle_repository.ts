import { logDebugInfo, logError } from "../../../utils/logger";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubPullRequestLifecycleClient } from "../../../application/ports/github_pull_request_ports";

export class PullRequestLifecycleRepository {
    constructor(private readonly githubClient: GithubClientPort<GithubPullRequestLifecycleClient>) {}
    /**
     * Returns the list of open pull request numbers whose head branch equals the given branch.
     * Used to sync size/progress labels from the issue to PRs when they are updated on push.
     */
    getOpenPullRequestNumbersByHeadBranch = async (
        owner: string,
        repository: string,
        headBranch: string,
        token: string,
    ): Promise<number[]> => {
        const octokit = this.githubClient.getClient(token);
        try {
            const { data } = await octokit.rest.pulls.list({
                owner,
                repo: repository,
                state: 'open',
                head: `${owner}:${headBranch}`,
            });
            const numbers = (data || []).map((pr) => pr.number);
            logDebugInfo(`Found ${numbers.length} open PR(s) for head branch "${headBranch}": ${numbers.join(', ') || 'none'}`);
            return numbers;
        } catch (error) {
            logError(`Error listing PRs for branch ${headBranch}: ${error}`);
            return [];
        }
    };

    /**
     * Returns the head branch of the first open PR that references the given issue number
     * (e.g. body contains "#123" or head ref contains "123" as in feature/123-...).
     * Used for issue_comment events where commit.branch is empty.
     * Uses bounded matching so #12 does not match #123 and branch "feature/1234-fix" does not match issue 123.
     */
    getHeadBranchForIssue = async (
        owner: string,
        repository: string,
        issueNumber: number,
        token: string
    ): Promise<string | undefined> => {
        const octokit = this.githubClient.getClient(token);
        const escaped = String(issueNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const bodyRefRegex = new RegExp(`(?:^|[^\\d])#${escaped}(?:$|[^\\d])`);
        const headRefRegex = new RegExp(`\\b${escaped}\\b`);
        try {
            const { data } = await octokit.rest.pulls.list({
                owner,
                repo: repository,
                state: 'open',
                per_page: 100,
            });
            for (const pr of data || []) {
                const body = pr.body ?? '';
                const headRef = pr.head?.ref ?? '';
                if (bodyRefRegex.test(body) || headRefRegex.test(headRef)) {
                    logDebugInfo(`Found head branch "${headRef}" for issue #${issueNumber} (PR #${pr.number}).`);
                    return headRef;
                }
            }
            logDebugInfo(`No open PR referencing issue #${issueNumber} found.`);
            return undefined;
        } catch (error) {
            logError(`Error getting head branch for issue #${issueNumber}: ${error}`);
            return undefined;
        }
    };

    /** Default timeout (ms) for isLinked fetch. */
    private static readonly IS_LINKED_FETCH_TIMEOUT_MS = 10000;

    isLinked = async (pullRequestUrl: string): Promise<boolean> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PullRequestLifecycleRepository.IS_LINKED_FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(pullRequestUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) {
                logDebugInfo(`isLinked: non-2xx response ${res.status} for ${pullRequestUrl}`);
                return false;
            }
            const htmlContent = await res.text();
            return !htmlContent.includes('has_github_issues=false');
        } catch (err) {
            clearTimeout(timeoutId);
            const msg = err instanceof Error ? err.message : String(err);
            logError(`isLinked: fetch failed for ${pullRequestUrl}: ${msg}`);
            return false;
        }
    };

    updateBaseBranch = async (
        owner: string,
        repository: string,
        pullRequestNumber: number,
        branch: string,
        token: string,
    ) => {
        const octokit = this.githubClient.getClient(token);
        await octokit.rest.pulls.update({
            owner: owner,
            repo: repository,
            pull_number: pullRequestNumber,
            base: branch,
        });

        logDebugInfo(`Changed base branch to ${branch}`);
    }

    updateDescription = async (
        owner: string,
        repository: string,
        pullRequestNumber: number,
        description: string,
        token: string,
    ) => {
        const octokit = this.githubClient.getClient(token);
        await octokit.rest.pulls.update({
            owner: owner,
            repo: repository,
            pull_number: pullRequestNumber,
            body: description,
        });

        logDebugInfo(`Updated PR #${pullRequestNumber} description with: ${description}`);
    }

}
