import { OctokitAuthenticatedUserClientAdapter, OctokitActorAuthorizationClientAdapter, OctokitOrganizationMembersClientAdapter } from "../github/octokit_identity_adapters";
export declare const createAuthenticatedUserClient: () => OctokitAuthenticatedUserClientAdapter;
export declare const createActorAuthorizationClient: () => OctokitActorAuthorizationClientAdapter;
export declare const createOrganizationMembersClient: () => OctokitOrganizationMembersClientAdapter;
