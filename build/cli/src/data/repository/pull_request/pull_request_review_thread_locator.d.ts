import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
type LocatedReviewThread = {
    id: string;
    isResolved: boolean;
};
/** Locates a review thread by comment identity across both connection levels. */
export declare function findPullRequestReviewThread(client: GithubGraphqlTransportClient, owner: string, repository: string, pullNumber: number, commentIdentity: string): Promise<LocatedReviewThread | null>;
export {};
