import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";
import { logDebugInfo } from "../../../utils/logger";
import { ProjectDetail } from "../../model/project_detail";
import type { ProjectBoardLinkPort } from "../../../application/ports/project_board_link_ports";
import type { ProjectBoardQueryPort } from "../../../application/ports/project_board_query_ports";

export class ProjectBoardLinkRepository implements ProjectBoardLinkPort {
    constructor(
        private readonly projectBoardQueryPort: ProjectBoardQueryPort,
        private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
    ) {}
    linkContentId = async (project: ProjectDetail, contentId: string, token: string): Promise<string> => {
        const existingItemId = await this.projectBoardQueryPort.getLinkedContentItemId(project, contentId, token);
        if (existingItemId) {
            logDebugInfo(`Content ${contentId} is already linked to project ${project.id}.`);
            return existingItemId;
        }
        const linkMutation = `mutation($projectId: ID!, $contentId: ID!) { addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) { item { id } } }`;
        const linkResult = await this.graphqlClient.getClient(token).graphql<{ addProjectV2ItemById?: { item?: { id: string } } }>(linkMutation, { projectId: project.id, contentId });
        const linkedItemId = linkResult.addProjectV2ItemById?.item?.id;
        if (!linkedItemId) {
            throw new Error(`GitHub did not return the project item created for content ${contentId} in project ${project.id}.`);
        }
        logDebugInfo(`Linked ${contentId} with id ${linkedItemId} to project ${project.id}`);
        return linkedItemId;
    };
}
