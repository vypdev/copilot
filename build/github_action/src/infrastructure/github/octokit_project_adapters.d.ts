import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "./ports/github_graphql_transport_port";
export declare class OctokitGraphqlTransportClientAdapter implements GithubClientPort<GithubGraphqlTransportClient> {
    getClient(token: string): GithubGraphqlTransportClient;
}
