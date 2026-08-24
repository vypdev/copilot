export interface GithubGraphqlTransportClient {
    graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}
