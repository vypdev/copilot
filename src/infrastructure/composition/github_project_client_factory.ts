import { OctokitGraphqlTransportClientAdapter } from "../github/octokit_project_adapters";
import { OctokitOwnerTypeClientAdapter } from "../github/octokit_identity_adapters";
export const createGraphqlTransportClient = () => new OctokitGraphqlTransportClientAdapter();
export const createOwnerTypeClient = () => new OctokitOwnerTypeClientAdapter();
