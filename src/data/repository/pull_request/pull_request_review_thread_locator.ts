import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import { PullRequestReviewOperationError } from '../../../application/ports/pull_request_review_errors';

type ThreadPageInfo = { hasNextPage: boolean; endCursor: string | null };
type ReviewCommentNode = { id?: string | null };
type ThreadCommentsConnection = {
    nodes?: Array<ReviewCommentNode | null> | null;
    pageInfo?: ThreadPageInfo | null;
};
type ThreadNode = {
    id: string;
    isResolved?: boolean | null;
    comments?: ThreadCommentsConnection | null;
};
type LocatedReviewThread = { id: string; isResolved: boolean };
type ThreadsConnection = {
    nodes?: Array<ThreadNode | null> | null;
    pageInfo?: ThreadPageInfo | null;
};
type ThreadsResult = {
    repository?: {
        pullRequest?: {
            reviewThreads?: ThreadsConnection | null;
        } | null;
    } | null;
};
type ThreadCommentsResult = {
    node?: {
        comments?: ThreadCommentsConnection | null;
    } | null;
};

const THREADS_QUERY = `
    query ($owner: String!, $repo: String!, $prNumber: Int!, $threadsAfter: String) {
        repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
                reviewThreads(first: 100, after: $threadsAfter) {
                    nodes {
                        id
                        isResolved
                        comments(first: 100) {
                            nodes { id }
                            pageInfo { hasNextPage endCursor }
                        }
                    }
                    pageInfo { hasNextPage endCursor }
                }
            }
        }
    }
`;

const THREAD_COMMENTS_QUERY = `
    query ($threadId: ID!, $commentsAfter: String) {
        node(id: $threadId) {
            ... on PullRequestReviewThread {
                comments(first: 100, after: $commentsAfter) {
                    nodes { id }
                    pageInfo { hasNextPage endCursor }
                }
            }
        }
    }
`;

/** Locates a review thread by comment identity across both connection levels. */
export async function findPullRequestReviewThread(
    client: GithubGraphqlTransportClient,
    owner: string,
    repository: string,
    pullNumber: number,
    commentIdentity: string,
): Promise<LocatedReviewThread | null> {
    if (commentIdentity.trim().length === 0) return null;
    let threadsCursor: string | null = null;
    const seenThreadCursors = new Set<string>();

    do {
        const threadsData: ThreadsResult = await client.graphql<ThreadsResult>(THREADS_QUERY, {
            owner,
            repo: repository,
            prNumber: pullNumber,
            threadsAfter: threadsCursor,
        });
        const threads: ThreadsConnection | null | undefined = threadsData?.repository?.pullRequest?.reviewThreads;
        if (threads == null) return null;

        for (const thread of threads.nodes ?? []) {
            if (thread == null) continue;
            const located = await findThreadComment(client, thread, commentIdentity);
            if (located) return located;
        }

        const nextThreadsCursor: string | null = threads.pageInfo?.endCursor ?? null;
        if (!threads.pageInfo?.hasNextPage || nextThreadsCursor == null) return null;
        if (seenThreadCursors.has(nextThreadsCursor)) {
            throw new PullRequestReviewOperationError('resolve-thread');
        }
        seenThreadCursors.add(nextThreadsCursor);
        threadsCursor = nextThreadsCursor;
    } while (threadsCursor != null);

    return null;
}

async function findThreadComment(
    client: GithubGraphqlTransportClient,
    thread: ThreadNode,
    commentIdentity: string,
): Promise<LocatedReviewThread | null> {
    let commentsCursor: string | null = null;
    const seenCommentCursors = new Set<string>();
    let commentNodes = thread.comments?.nodes ?? [];
    let commentsPageInfo = thread.comments?.pageInfo;

    while (true) {
        if (commentNodes.some((comment) => comment?.id === commentIdentity)) {
            return { id: thread.id, isResolved: thread.isResolved === true };
        }
        const nextCommentsCursor = commentsPageInfo?.endCursor ?? null;
        if (!commentsPageInfo?.hasNextPage || nextCommentsCursor == null) return null;
        if (seenCommentCursors.has(nextCommentsCursor)) {
            throw new PullRequestReviewOperationError('resolve-thread');
        }
        seenCommentCursors.add(nextCommentsCursor);
        commentsCursor = nextCommentsCursor;
        const nextComments = await client.graphql<ThreadCommentsResult>(THREAD_COMMENTS_QUERY, {
            threadId: thread.id,
            commentsAfter: commentsCursor,
        });
        commentNodes = nextComments?.node?.comments?.nodes ?? [];
        commentsPageInfo = nextComments?.node?.comments?.pageInfo ?? {
            hasNextPage: false,
            endCursor: null,
        };
    }
}
