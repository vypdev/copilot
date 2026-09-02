import { OctokitAuthenticatedUserClientAdapter, OctokitActorAuthorizationClientAdapter, OctokitOrganizationMembersClientAdapter } from "../github/octokit_identity_adapters";
import { OctokitRepositoryVariablesClientAdapter } from '../github/octokit_repository_variables_adapter';
export declare const createAuthenticatedUserClient: () => OctokitAuthenticatedUserClientAdapter;
export declare const createActorAuthorizationClient: () => OctokitActorAuthorizationClientAdapter;
export declare const createOrganizationMembersClient: () => OctokitOrganizationMembersClientAdapter;
export declare const createRepositoryVariablesClient: () => OctokitRepositoryVariablesClientAdapter;
