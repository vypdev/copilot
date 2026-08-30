import { logDebugInfo } from '../../../utils/logger';
import type { PullRequestReviewThreadCommandPort } from '../../../application/ports/pull_request_review_comment_ports';
import {
    PullRequestReviewOperationError,
    toPullRequestReviewOperationError,
} from '../../../application/ports/pull_request_review_errors';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import { findPullRequestReviewThread } from './pull_request_review_thread_locator';

/** GitHub GraphQL adapter for locating and resolving a pull-request review thread. */
export class PullRequestReviewThreadRepository implements PullRequestReviewThreadCommandPort {
    constructor(
        private readonly githubClient: GithubClientPort<GithubGraphqlTransportClient>,
    ) {}

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
