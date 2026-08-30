import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import type { GithubOwnerTypeClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";
import { ProjectDetail } from "../../model/project_detail";
/** Reads a ProjectV2 without leaking GitHub's owner-specific GraphQL shape. */
export declare function getProjectBoardDetail(ownerTypeClient: GithubClientPort<GithubOwnerTypeClient>, graphqlClient: GithubClientPort<GithubGraphqlTransportClient>, projectId: string, owner: string, token: string): Promise<ProjectDetail>;
