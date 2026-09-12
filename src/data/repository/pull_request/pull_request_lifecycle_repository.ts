import { logDebugInfo, logError } from "../../../utils/logger";
import type { PullRequestDescriptionDetails } from '../../../application/ports/pull_request_description_ports';
import type { PullRequestHeadShaPort } from '../../../application/ports/issue_management_ports';
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type {
    GithubPullRequestLifecycleClient,
    GithubPullRequestSummary,
} from "../../../infrastructure/github/ports/github_pull_request_provider_ports";
import { toApplicationError } from '../../../application/errors/application_error';
import type { BugbotPullRequestIdentity } from '../../../domain/bugbot/context';

export class PullRequestLifecycleRepository implements PullRequestHeadShaPort {
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
            const pullRequests = await this.listOpenPullRequests(octokit, owner, repository, {
                head: `${owner}:${headBranch}`,
            });
            const numbers = pullRequests.map((pr) => pr.number);
            logDebugInfo(`Found ${numbers.length} open PR(s) for head branch "${headBranch}": ${numbers.join(', ') || 'none'}`);
            return numbers;
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', `Unable to list pull requests for branch ${headBranch}.`));
            throw error;
        }
    };

    getBugbotPullRequestIdentity = async (
        owner: string,
        repository: string,
        pullRequestNumber: number,
        token: string,
    ): Promise<BugbotPullRequestIdentity> => {
        const octokit = this.githubClient.getClient(token);
        try {
            if (!octokit.rest.pulls.get) throw new Error('Pull-request identity query is not available.');
            const { data } = await octokit.rest.pulls.get({
                owner,
                repo: repository,
                pull_number: pullRequestNumber,
            });
            return toBugbotPullRequestIdentity(data);
        } catch (error) {
            const semanticError = toApplicationError(
                error,
                'provider.unavailable',
                `Unable to verify pull request #${pullRequestNumber}.`,
            );
            logError(semanticError);
            throw semanticError;
        }
    };

    findOpenBugbotPullRequestsByExactHead = async (
        owner: string,
        repository: string,
        headOwner: string,
        headRef: string,
        token: string,
    ): Promise<readonly BugbotPullRequestIdentity[]> => {
        const octokit = this.githubClient.getClient(token);
        try {
            const { data } = await octokit.rest.pulls.list({
                owner,
                repo: repository,
                state: 'open',
                head: `${headOwner}:${headRef}`,
                per_page: 2,
                page: 1,
            });
            if (!Array.isArray(data)) throw new Error('Exact-head pull request query did not return an array.');
            return data.slice(0, 2).map(toBugbotPullRequestIdentity);
        } catch (error) {
            const semanticError = toApplicationError(
                error,
                'provider.unavailable',
                `Unable to resolve the exact pull request for ${headOwner}:${headRef}.`,
            );
            logError(semanticError);
            throw semanticError;
        }
    };

    private async listOpenPullRequests(
        octokit: GithubPullRequestLifecycleClient,
        owner: string,
        repository: string,
        filters: Record<string, unknown> = {},
    ): Promise<GithubPullRequestSummary[]> {
        const allPullRequests: GithubPullRequestSummary[] = [];
        const maximumPages = 100;
        for (let page = 1; page <= maximumPages; page += 1) {
            const { data } = await octokit.rest.pulls.list({
                owner,
                repo: repository,
                state: 'open',
                per_page: 100,
                page,
                ...filters,
            });
            allPullRequests.push(...(data ?? []));
            if ((data ?? []).length < 100) return allPullRequests;
        }
        throw new Error(`Open pull request pagination exceeded ${maximumPages} pages.`);
    }

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

    getDetails = async (
        owner: string,
        repository: string,
        pullRequestNumber: number,
        token: string,
    ): Promise<PullRequestDescriptionDetails> => {
        const octokit = this.githubClient.getClient(token);
        if (!octokit.rest.pulls.get) throw new Error('Pull-request details query is not available.');
        const { data } = await octokit.rest.pulls.get({
            owner,
            repo: repository,
            pull_number: pullRequestNumber,
        });
        return {
            body: data.body ?? '',
            headBranch: data.head?.ref ?? '',
            baseBranch: data.base?.ref ?? '',
        };
    };

    getPullRequestHeadSha = async (
        owner: string,
        repository: string,
        pullRequestNumber: number,
        token: string,
    ): Promise<string | undefined> => {
        const octokit = this.githubClient.getClient(token);
        if (!octokit.rest.pulls.get) return undefined;
        const { data } = await octokit.rest.pulls.get({
            owner,
            repo: repository,
            pull_number: pullRequestNumber,
        });
        return data.head?.sha ?? undefined;
    };

}

function toBugbotPullRequestIdentity(value: {
    number?: number;
    state?: string;
    head?: {
        ref?: string | null;
        sha?: string | null;
        repo?: { owner?: { login?: string | null } | null } | null;
    };
    base?: {
        repo?: {
            id?: number;
            name?: string | null;
            owner?: { login?: string | null } | null;
        } | null;
    };
}): BugbotPullRequestIdentity {
    const number = value.number;
    const state = value.state;
    const baseOwner = value.base?.repo?.owner?.login?.trim();
    const baseName = value.base?.repo?.name?.trim();
    const headOwner = value.head?.repo?.owner?.login?.trim();
    const headRef = value.head?.ref?.trim();
    const headSha = value.head?.sha?.trim().toLowerCase();
    if (!Number.isSafeInteger(number) || Number(number) <= 0
        || (state !== 'open' && state !== 'closed')
        || !baseOwner || !baseName || !headOwner || !headRef
        || !headSha || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(headSha)) {
        throw new Error('Pull-request identity response is incomplete or invalid.');
    }
    const repositoryId = value.base?.repo?.id;
    return {
        number: Number(number),
        state,
        baseRepository: {
            owner: baseOwner,
            name: baseName,
            ...(Number.isSafeInteger(repositoryId) && Number(repositoryId) > 0 ? { id: Number(repositoryId) } : {}),
        },
        headRepositoryOwner: headOwner,
        headRef,
        headSha,
    };
}
