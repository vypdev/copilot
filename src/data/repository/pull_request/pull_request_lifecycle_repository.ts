import { logDebugInfo, logError } from "../../../utils/logger";
import type { PullRequestDescriptionDetails } from '../../../application/ports/pull_request_description_ports';
import type { PullRequestHeadShaPort } from '../../../application/ports/issue_management_ports';
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type {
    GithubPullRequestLifecycleClient,
    GithubPullRequestSummary,
    GithubPullRequestLinkageResponse,
} from "../../../infrastructure/github/ports/github_pull_request_provider_ports";
import { ApplicationError, toApplicationError } from '../../../application/errors/application_error';
import { getGithubErrorStatus, isGithubRateLimited } from '../github/github_error_policy';
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

    /** Reads at most 200 closing references through the credential-bound API. */
    isLinked = async (
        owner: string,
        repository: string,
        pullRequestNumber: number,
        issueNumber: number,
        token: string,
    ): Promise<boolean> => {
        try {
            if (![pullRequestNumber, issueNumber].every(number => Number.isSafeInteger(number) && number > 0)) {
                throw new ApplicationError('validation.invalid-input', 'Linkage requires positive PR and issue numbers.');
            }
            const client = this.githubClient.getClient(token);
            if (!client.graphql) throw new ApplicationError('configuration.unsupported', 'Authenticated PR linkage queries are not supported by this installation.');
            const expectedRepository = `${owner}/${repository}`.toLowerCase();
            let cursor: string | null = null;
            for (let page = 0; page < 2; page += 1) {
                const result: GithubPullRequestLinkageResponse = await client.graphql<GithubPullRequestLinkageResponse>(`
                    query PullRequestIssueLinkage($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
                        repository(owner: $owner, name: $repo) {
                            nameWithOwner
                            pullRequest(number: $number) {
                                number
                                closingIssuesReferences(first: 100, after: $cursor) {
                                    nodes { number repository { nameWithOwner } }
                                    pageInfo { hasNextPage endCursor }
                                }
                            }
                        }
                    }`, { owner, repo: repository, number: pullRequestNumber, cursor });
                const resource = result?.repository;
                if (resource === null || resource?.pullRequest === null) {
                    throw new ApplicationError('provider.not-found', 'The requested pull request is unavailable to the configured credential.');
                }
                const pr = resource?.pullRequest;
                const references = pr?.closingIssuesReferences;
                if (typeof resource?.nameWithOwner !== 'string' || resource.nameWithOwner.toLowerCase() !== expectedRepository || pr?.number !== pullRequestNumber
                    || !Array.isArray(references?.nodes) || references.nodes.length > 100
                    || typeof references.pageInfo?.hasNextPage !== 'boolean'
                    || references.nodes.some(node => !node || !Number.isSafeInteger(node.number) || node.number <= 0
                        || typeof node.repository?.nameWithOwner !== 'string' || !node.repository.nameWithOwner)) {
                    throw new ApplicationError('provider.contract-invalid', 'GitHub did not return verifiable PR linkage evidence.');
                }
                if (references.nodes.some(node => node.number === issueNumber
                    && node.repository.nameWithOwner.toLowerCase() === expectedRepository)) return true;
                if (!references.pageInfo.hasNextPage) return false;
                const nextCursor = references.pageInfo.endCursor;
                if (typeof nextCursor !== 'string' || !nextCursor || nextCursor === cursor) {
                    throw new ApplicationError('provider.contract-invalid', 'GitHub returned incomplete linkage pagination.');
                }
                cursor = nextCursor;
            }
            throw new ApplicationError('provider.contract-invalid', 'PR linkage exceeds the fixed 200-reference inspection bound.');
        } catch (error) {
            const status = getGithubErrorStatus(error);
            const types = typeof error === 'object' && error !== null && 'errors' in error && Array.isArray(error.errors)
                ? error.errors.map((entry: { type?: string }) => entry?.type) : [];
            const code = isGithubRateLimited(error) || types.includes('RATE_LIMITED') ? 'provider.rate-limited'
                : status === 401 ? 'authorization.credential-invalid'
                : status === 403 || types.includes('FORBIDDEN') || types.includes('UNAUTHORIZED') ? 'authorization.denied'
                : status === 404 || types.includes('NOT_FOUND') ? 'provider.not-found' : 'provider.unavailable';
            const semanticError = toApplicationError(error, code, `Unable to inspect issue linkage for pull request #${pullRequestNumber}.`);
            logError(semanticError);
            throw semanticError;
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
        const native = toBugbotPullRequestIdentity(data);
        if (native.number !== pullRequestNumber || native.baseRepository.owner !== owner
            || native.baseRepository.name !== repository || !native.headRepositoryName) {
            throw new Error('Pull-request identity does not match the bound repository.');
        }
        return {
            body: data.body ?? '',
            headBranch: native.headRef,
            baseBranch: data.base?.ref ?? '',
            identity: { number: native.number, state: native.state, repository: `${owner}/${repository}`,
                headRepository: `${native.headRepositoryOwner}/${native.headRepositoryName}`,
                headRef: native.headRef, headSha: native.headSha },
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
    draft?: boolean;
    head?: {
        ref?: string | null;
        sha?: string | null;
        repo?: { name?: string | null; owner?: { login?: string | null } | null } | null;
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
    const headName = typeof value.head?.repo?.name === 'string' ? value.head.repo.name.trim() : undefined;
    const headRef = value.head?.ref?.trim();
    const headSha = value.head?.sha?.trim().toLowerCase();
    if (!Number.isSafeInteger(number) || Number(number) <= 0
        || (state !== 'open' && state !== 'closed')
        || typeof value.draft !== 'boolean'
        || !baseOwner || !baseName || !headOwner || !headRef
        || !headSha || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(headSha)) {
        throw new Error('Pull-request identity response is incomplete or invalid.');
    }
    const repositoryId = value.base?.repo?.id;
    return {
        number: Number(number),
        state,
        draft: value.draft,
        baseRepository: {
            owner: baseOwner,
            name: baseName,
            ...(Number.isSafeInteger(repositoryId) && Number(repositoryId) > 0 ? { id: Number(repositoryId) } : {}),
        },
        headRepositoryOwner: headOwner,
        ...(headName ? { headRepositoryName: headName } : {}),
        headRef,
        headSha,
    };
}
