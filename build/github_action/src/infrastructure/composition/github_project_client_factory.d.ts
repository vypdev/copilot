import { OctokitGraphqlTransportClientAdapter } from "../github/octokit_project_adapters";
import { OctokitOwnerTypeClientAdapter } from "../github/octokit_identity_adapters";
export declare const createGraphqlTransportClient: () => OctokitGraphqlTransportClientAdapter;
export declare const createOwnerTypeClient: () => OctokitOwnerTypeClientAdapter;
