import { logDebugInfo } from '../../../utils/logger';
import type {
    PullRequestReviewThreadCommandPort,
    PullRequestReviewThreadStateQueryPort,
    PullRequestReviewThreadState,
} from '../../../application/ports/pull_request_review_comment_ports';
import {
    PullRequestReviewOperationError,
    toPullRequestReviewOperationError,
} from '../../../application/ports/pull_request_review_errors';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import { findPullRequestReviewThread } from './pull_request_review_thread_locator';
import type { BugbotSourceCoverage } from '../../../domain/bugbot/context';

/** GitHub GraphQL adapter for locating and resolving a pull-request review thread. */
export class PullRequestReviewThreadRepository implements PullRequestReviewThreadCommandPort, PullRequestReviewThreadStateQueryPort {
    constructor(
        private readonly githubClient: GithubClientPort<GithubGraphqlTransportClient>,
    ) {}

    listPullRequestReviewThreadStates = async (
        owner: string,
        repository: string,
        pullNumber: number,
        token: string,
    ): Promise<Record<string, PullRequestReviewThreadState>> => {
        try {
            const client = this.githubClient.getClient(token);
            const states: Record<string, PullRequestReviewThreadState> = {};
            let cursor: string | null = null;
            do {
                const result: {
                    repository?: {
                        pullRequest?: {
                            reviewThreads?: {
                                nodes?: Array<{
                                    isResolved?: boolean;
                                    resolvedBy?: { login?: string | null } | null;
                                    comments?: { nodes?: Array<{ id?: string | null } | null> | null } | null;
                                } | null> | null;
                                pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
                            } | null;
                        } | null;
                    } | null;
                } = await client.graphql(
                    `query ($owner: String!, $repository: String!, $pullNumber: Int!, $cursor: String) {
                        repository(owner: $owner, name: $repository) {
                            pullRequest(number: $pullNumber) {
                                reviewThreads(first: 100, after: $cursor) {
                                    nodes {
                                        isResolved
                                        resolvedBy { login }
                                    comments(first: 100) { nodes { id } }
                                    }
                                    pageInfo { hasNextPage endCursor }
                                }
                            }
                        }
                    }`,
                    { owner, repository, pullNumber, cursor },
                );
                const threads = result.repository?.pullRequest?.reviewThreads;
                for (const thread of threads?.nodes ?? []) {
                    if (!thread) continue;
                    for (const comment of thread.comments?.nodes ?? []) {
                        if (comment?.id) {
                            states[comment.id] = {
                                resolved: thread.isResolved === true,
                                ...(thread.resolvedBy?.login ? { resolvedByLogin: thread.resolvedBy.login } : {}),
                            };
                        }
                    }
                }
                cursor = threads?.pageInfo?.hasNextPage
                    ? threads.pageInfo.endCursor ?? null
                    : null;
            } while (cursor !== null);
            return states;
        } catch (error) {
            throw toPullRequestReviewOperationError(error, 'list-threads');
        }
    };

    listBugbotPullRequestReviewThreadStatesBounded = async (
        owner: string,
        repository: string,
        pullNumber: number,
        token: string,
    ): Promise<{
        readonly states: Record<string, PullRequestReviewThreadState>;
        readonly coverage: BugbotSourceCoverage;
    }> => {
        try {
            const client = this.githubClient.getClient(token);
            const states: Record<string, PullRequestReviewThreadState> = {};
            let cursor: string | null = null;
            let pagesFetched = 0;
            let threadCount = 0;
            let limitReached = false;
            do {
                const result: {
                    repository?: {
                        pullRequest?: {
                            reviewThreads?: {
                                nodes?: Array<{
                                    isResolved?: boolean;
                                    resolvedBy?: { login?: string | null } | null;
                                    comments?: { nodes?: Array<{ id?: string | null } | null> | null } | null;
                                } | null> | null;
                                pageInfo?: { hasPreviousPage?: boolean; startCursor?: string | null } | null;
                            } | null;
                        } | null;
                    } | null;
                } = await client.graphql(
                    `query ($owner: String!, $repository: String!, $pullNumber: Int!, $cursor: String) {
                        repository(owner: $owner, name: $repository) {
                            pullRequest(number: $pullNumber) {
                                reviewThreads(last: 100, before: $cursor) {
                                    nodes {
                                        isResolved
                                        resolvedBy { login }
                                        comments(first: 1) { nodes { id } }
                                    }
                                    pageInfo { hasPreviousPage startCursor }
                                }
                            }
                        }
                    }`,
                    { owner, repository, pullNumber, cursor },
                );
                const threads = result.repository?.pullRequest?.reviewThreads;
                const nodes = threads?.nodes ?? [];
                pagesFetched += 1;
                for (const thread of nodes) {
                    if (!thread) continue;
                    threadCount += 1;
                    for (const comment of thread.comments?.nodes ?? []) {
                        if (comment?.id) {
                            states[comment.id] = {
                                resolved: thread.isResolved === true,
                                ...(thread.resolvedBy?.login ? { resolvedByLogin: thread.resolvedBy.login } : {}),
                            };
                        }
                    }
                }
                const hasOlder = threads?.pageInfo?.hasPreviousPage === true;
                if (hasOlder && pagesFetched < 2) {
                    cursor = threads?.pageInfo?.startCursor ?? null;
                    if (cursor === null) throw new Error('Review thread pagination cursor is missing.');
                } else {
                    limitReached = hasOlder;
                    cursor = null;
                }
            } while (cursor !== null);
            return {
                states,
                coverage: {
                    source: 'review-threads',
                    status: limitReached ? 'partial' : 'complete',
                    pagesFetched,
                    itemsFetched: threadCount,
                    itemsRetained: threadCount,
                    omittedItems: 0,
                    truncatedItems: 0,
                    limitReached,
                    ...(limitReached ? { providerLimitReached: true } : {}),
                },
            };
        } catch (error) {
            throw toPullRequestReviewOperationError(error, 'list-threads');
        }
    };

    resolvePullRequestReviewThread = async (
        owner: string,
        repository: string,
        pullNumber: number,
        commentIdentity: string,
        token: string,
    ): Promise<void> => {
        try {
            const client = this.githubClient.getClient(token);
            const thread = await findPullRequestReviewThread(
                client,
                owner,
                repository,
                pullNumber,
                commentIdentity,
            );
            if (thread == null) throw new PullRequestReviewOperationError('resolve-thread');
            if (thread.isResolved) {
                logDebugInfo('Pull request review thread is already resolved.');
                return;
            }

            const result = await client.graphql<{
                resolveReviewThread?: { thread?: { id: string } | null };
            }>(
                `mutation ($threadId: ID!) {
                    resolveReviewThread(input: { threadId: $threadId }) {
                        thread { id }
                    }
                }`,
                { threadId: thread.id },
            );
            if (result.resolveReviewThread?.thread?.id !== thread.id) {
                throw new PullRequestReviewOperationError('resolve-thread');
            }
            logDebugInfo('Resolved pull request review thread.');
        } catch (error) {
            throw toPullRequestReviewOperationError(error, 'resolve-thread');
        }
    };

    unresolvePullRequestReviewThread = async (
        owner: string,
        repository: string,
        pullNumber: number,
        commentIdentity: string,
        token: string,
    ): Promise<void> => {
        try {
            const client = this.githubClient.getClient(token);
            const thread = await findPullRequestReviewThread(
                client,
                owner,
                repository,
                pullNumber,
                commentIdentity,
            );
            if (thread == null) throw new PullRequestReviewOperationError('unresolve-thread');
            if (!thread.isResolved) {
                logDebugInfo('Pull request review thread is already unresolved.');
                return;
            }

            const result = await client.graphql<{
                unresolveReviewThread?: { thread?: { id: string } | null };
            }>(
                `mutation ($threadId: ID!) {
                    unresolveReviewThread(input: { threadId: $threadId }) {
                        thread { id }
                    }
                }`,
                { threadId: thread.id },
            );
            if (result.unresolveReviewThread?.thread?.id !== thread.id) {
                throw new PullRequestReviewOperationError('unresolve-thread');
            }
            logDebugInfo('Reopened pull request review thread.');
        } catch (error) {
            throw toPullRequestReviewOperationError(error, 'unresolve-thread');
        }
    };
}
