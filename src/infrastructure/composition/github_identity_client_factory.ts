import { OctokitAuthenticatedUserClientAdapter, OctokitActorAuthorizationClientAdapter, OctokitOrganizationMembersClientAdapter } from "../github/octokit_identity_adapters";
export const createAuthenticatedUserClient = () => new OctokitAuthenticatedUserClientAdapter();
export const createActorAuthorizationClient = () => new OctokitActorAuthorizationClientAdapter();
export const createOrganizationMembersClient = () => new OctokitOrganizationMembersClientAdapter();
