import { ApplicationError } from '../../../application/errors/application_error';
import type { StagedRolloutReviewPort } from '../../../application/ports/staged_rollout_ports';
import { isStagedRolloutDeclaration, type StagedRolloutEvidence, type StagedRolloutReview } from '../../../domain/staged_rollout';
import { githubUsersMatch } from '../../../domain/github_user_policy';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import { isGithubNotFound } from '../github/github_error_policy';

export interface StagedRolloutGitHubClient extends GithubGraphqlTransportClient {
    readonly rest: { readonly repos: { getCollaboratorPermissionLevel(parameters: {
        owner: string;
        repo: string;
        username: string;
        request: { redirect: 'error' };
    }): Promise<{ data: { role_name?: string; user?: { login?: string; type?: string } } }> } };
}

interface ReviewNode {
    readonly fullDatabaseId: string | null;
    readonly body: string;
    readonly state: string;
    readonly submittedAt: string | null;
    readonly lastEditedAt: string | null;
    readonly commit: { readonly oid: string } | null;
    readonly author: { readonly login: string; readonly __typename: string } | null;
}

interface RepositoryPage {
    readonly repository: {
        readonly nameWithOwner: string;
        readonly defaultBranchRef: { readonly name: string } | null;
        readonly pullRequest: {
            readonly number: number;
            readonly state: string;
            readonly body: string;
            readonly headRefName: string;
            readonly headRefOid: string;
            readonly headRepository: { readonly nameWithOwner: string } | null;
            readonly baseRefName: string;
            readonly mergedAt: string | null;
            readonly reviews: {
                readonly nodes: readonly (ReviewNode | null)[];
                readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
            };
        } | null;
    } | null;
}

const MERGED_REVIEW_QUERY = `query StagedRolloutReviews($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
        nameWithOwner defaultBranchRef { name }
        pullRequest(number: $number) {
            number state body headRefName headRefOid headRepository { nameWithOwner } baseRefName mergedAt
            reviews(first: 100, after: $cursor) {
                nodes { fullDatabaseId body state submittedAt lastEditedAt commit { oid } author { __typename login } }
                pageInfo { hasNextPage endCursor }
            }
        }
    }
}`;

export class StagedRolloutReviewRepository implements StagedRolloutReviewPort {
    constructor(private readonly client: StagedRolloutGitHubClient, private readonly owner: string, private readonly repo: string) {}

    async readMergedPullRequest(pullRequestNumber: number): Promise<StagedRolloutEvidence> {
        const reviews: StagedRolloutReview[] = [];
        const cursors = new Set<string>();
        let cursor: string | null = null;
        let initial: Omit<StagedRolloutEvidence, 'reviews'> | undefined;
        for (let page = 0; page < 10; page++) {
            const response: RepositoryPage = await this.client.graphql(MERGED_REVIEW_QUERY, {
                owner: this.owner, repo: this.repo, number: pullRequestNumber, cursor,
            });
            const repository = response.repository;
            const pull = repository?.pullRequest;
            if (repository?.nameWithOwner?.toLowerCase() !== `${this.owner}/${this.repo}`.toLowerCase()
                || pull?.number !== pullRequestNumber || pull.state !== 'MERGED'
                || !pull.mergedAt || typeof pull.body !== 'string' || !pull.baseRefName || !pull.headRefName || !pull.headRefOid
                || !repository.defaultBranchRef?.name || !Array.isArray(pull.reviews?.nodes)
                || pull.reviews.nodes.length > 100 || typeof pull.reviews.pageInfo?.hasNextPage !== 'boolean') throw unavailable();
            const facts = {
                repository: repository.nameWithOwner,
                headRepository: pull.headRepository?.nameWithOwner ?? null,
                headBranch: pull.headRefName,
                headSha: pull.headRefOid,
                baseBranch: pull.baseRefName,
                defaultBranch: repository.defaultBranchRef.name,
                mergedAt: pull.mergedAt,
                body: pull.body,
            };
            if (initial && JSON.stringify(initial) !== JSON.stringify(facts)) throw unavailable();
            initial = facts;
            for (const review of pull.reviews.nodes as readonly (ReviewNode | null)[]) {
                if (typeof review?.body !== 'string') throw unavailable();
                if (!isStagedRolloutDeclaration(review.body)) continue;
                reviews.push({
                    id: review.fullDatabaseId, body: review.body, state: review.state, submittedAt: review.submittedAt,
                    lastEditedAt: review.lastEditedAt, commitSha: review.commit?.oid ?? null,
                    author: review.author && { login: review.author.login, type: review.author.__typename },
                });
            }
            if (!pull.reviews.pageInfo.hasNextPage) return { ...facts, reviews };
            cursor = pull.reviews.pageInfo.endCursor;
            if (!cursor || cursors.has(cursor)) throw unavailable();
            cursors.add(cursor);
        }
        throw unavailable();
    }

    async isMaintainer(login: string): Promise<boolean> {
        try {
            const { data } = await this.client.rest.repos.getCollaboratorPermissionLevel({
                owner: this.owner, repo: this.repo, username: login, request: { redirect: 'error' },
            });
            if (data.user?.type !== 'User' || !githubUsersMatch(data.user.login ?? '', login)) return false;
            return data.role_name === 'admin' || data.role_name === 'maintain';
        } catch (error) {
            // The merge path has already verified the repository and review.
            // A missing reviewer permission record grants no current role.
            if (isGithubNotFound(error)) return false;
            throw error;
        }
    }
}

function unavailable(): ApplicationError {
    return new ApplicationError('provider.contract-invalid', 'GitHub staged rollout review evidence is incomplete or changed.');
}
