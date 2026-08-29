import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubActorAuthorizationClient, GithubAuthenticatedUserClient, GithubOrganizationMembersClient } from "../../application/ports/github_identity_ports";
import type { GithubOwnerTypeClient, GithubRepositoryContextClient } from "./ports/github_identity_provider_ports";
export declare class OctokitAuthenticatedUserClientAdapter implements GithubClientPort<GithubAuthenticatedUserClient> {
    getClient(token: string): GithubAuthenticatedUserClient;
}
export declare class OctokitActorAuthorizationClientAdapter implements GithubClientPort<GithubActorAuthorizationClient> {
    getClient(token: string): GithubActorAuthorizationClient;
}
export declare class OctokitOrganizationMembersClientAdapter implements GithubClientPort<GithubOrganizationMembersClient> {
    getClient(token: string): GithubOrganizationMembersClient;
}
export declare class OctokitRepositoryContextClientAdapter implements GithubClientPort<GithubRepositoryContextClient> {
    getClient(_token: string): GithubRepositoryContextClient;
}
export declare class OctokitOwnerTypeClientAdapter implements GithubClientPort<GithubOwnerTypeClient> {
    getClient(token: string): GithubOwnerTypeClient;
}
