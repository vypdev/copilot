import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubActorAuthorizationClient, GithubAuthenticatedUserClient, GithubOrganizationMembersClient } from "./ports/github_identity_provider_ports";
import type { GithubOwnerTypeClient } from "./ports/github_identity_provider_ports";
export declare class OctokitAuthenticatedUserClientAdapter implements GithubClientPort<GithubAuthenticatedUserClient> {
    getClient(token: string): GithubAuthenticatedUserClient;
}
export declare class OctokitActorAuthorizationClientAdapter implements GithubClientPort<GithubActorAuthorizationClient> {
    getClient(token: string): GithubActorAuthorizationClient;
}
export declare class OctokitOrganizationMembersClientAdapter implements GithubClientPort<GithubOrganizationMembersClient> {
    getClient(token: string): GithubOrganizationMembersClient;
}
export declare class OctokitOwnerTypeClientAdapter implements GithubClientPort<GithubOwnerTypeClient> {
    getClient(token: string): GithubOwnerTypeClient;
}
