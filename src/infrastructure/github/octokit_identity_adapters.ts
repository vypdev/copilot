import { getOctokitClient } from "./octokit_client_resolver";
import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubActorAuthorizationClient, GithubAuthenticatedUserClient, GithubOrganizationMembersClient } from "../../application/ports/github_identity_ports";
import type { GithubOwnerTypeClient } from "./ports/github_identity_provider_ports";

export class OctokitAuthenticatedUserClientAdapter implements GithubClientPort<GithubAuthenticatedUserClient> {
    getClient(token: string): GithubAuthenticatedUserClient { return getOctokitClient<GithubAuthenticatedUserClient>(token); }
}
export class OctokitActorAuthorizationClientAdapter implements GithubClientPort<GithubActorAuthorizationClient> {
    getClient(token: string): GithubActorAuthorizationClient { return getOctokitClient<GithubActorAuthorizationClient>(token); }
}
export class OctokitOrganizationMembersClientAdapter implements GithubClientPort<GithubOrganizationMembersClient> {
    getClient(token: string): GithubOrganizationMembersClient { return getOctokitClient<GithubOrganizationMembersClient>(token); }
}
export class OctokitOwnerTypeClientAdapter implements GithubClientPort<GithubOwnerTypeClient> {
    getClient(token: string): GithubOwnerTypeClient { return getOctokitClient<GithubOwnerTypeClient>(token); }
}
