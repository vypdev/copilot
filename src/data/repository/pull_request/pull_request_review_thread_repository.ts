import { logDebugInfo } from '../../../utils/logger';
import type {
    PullRequestReviewThreadCommandPort,
    PullRequestReviewThreadStateQueryPort,
} from '../../../application/ports/pull_request_review_comment_ports';
import {
    PullRequestReviewOperationError,
    toPullRequestReviewOperationError,
} from '../../../application/ports/pull_request_review_errors';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import { findPullRequestReviewThread } from './pull_request_review_thread_locator';

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
    ): Promise<Record<string, boolean>> => {
        try {
            const client = this.githubClient.getClient(token);
            const states: Record<string, boolean> = {};
            let cursor: string | null = null;
            do {
                const result: {
                    repository?: {
                        pullRequest?: {
                            reviewThreads?: {
                                nodes?: Array<{
                                    isResolved?: boolean;
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
                        if (comment?.id) states[comment.id] = thread.isResolved === true;
                    }
                }
                cursor = threads?.pageInfo?.hasNextPage
                    ? threads.pageInfo.endCursor ?? null
                    : null;
            } while (cursor !== null);
            return states;
        } catch (error) {
            throw toPullRequestReviewOperationError(error, 'list-comments');
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
