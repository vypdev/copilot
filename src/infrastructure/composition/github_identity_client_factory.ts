import { OctokitAuthenticatedUserClientAdapter, OctokitActorAuthorizationClientAdapter, OctokitOrganizationMembersClientAdapter } from "../github/octokit_identity_adapters";
import { OctokitRepositoryVariablesClientAdapter } from '../github/octokit_repository_variables_adapter';
export const createAuthenticatedUserClient = () => new OctokitAuthenticatedUserClientAdapter();
export const createActorAuthorizationClient = () => new OctokitActorAuthorizationClientAdapter();
export const createOrganizationMembersClient = () => new OctokitOrganizationMembersClientAdapter();
export const createRepositoryVariablesClient = () => new OctokitRepositoryVariablesClientAdapter();
