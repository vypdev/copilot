import { OctokitGraphqlTransportClientAdapter } from "../github/octokit_project_adapters";
import { OctokitRepositoryContextClientAdapter, OctokitOwnerTypeClientAdapter } from "../github/octokit_identity_adapters";
export const createGraphqlTransportClient = () => new OctokitGraphqlTransportClientAdapter();
export const createRepositoryContextClient = () => new OctokitRepositoryContextClientAdapter();
export const createOwnerTypeClient = () => new OctokitOwnerTypeClientAdapter();
