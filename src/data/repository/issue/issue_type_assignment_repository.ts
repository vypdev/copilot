import { logDebugInfo, logError } from "../../../utils/logger";
import { Labels } from "../../model/labels";
import { IssueTypes } from "../../model/issue_types";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";

type SelectedIssueType = { name: string; description: string; color: string };
type GetIssueId = (owner: string, repository: string, issueNumber: number, token: string) => Promise<string>;

export class IssueTypeAssignmentRepository {
    constructor(
        private readonly getIssueId: GetIssueId,
        private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>,
    ) {}

    setIssueType = async (
        owner: string,
        repository: string,
        issueNumber: number,
        labels: Labels,
        issueTypes: IssueTypes,
        token: string,
    ): Promise<void> => {
        try {
            const selected = this.selectIssueType(labels, issueTypes);
            const octokit = this.graphqlClient.getClient(token);
            logDebugInfo(`Setting issue type for issue ${issueNumber} to ${selected.name}`);

            const issueId = await this.getIssueId(owner, repository, issueNumber, token);
            const { organization } = await octokit.graphql<{ organization: { id: string; issueTypes: { nodes: { id: string; name: string }[] } } }>(`
                query ($owner: String!) {
                    organization(login: $owner) { id issueTypes(first: 20) { nodes { id name } } }
                }
            `, { owner });
            let issueTypeId = organization.issueTypes.nodes.find(
                type => type.name.toLowerCase() === selected.name.toLowerCase(),
            )?.id;

            if (!issueTypeId) {
                try {
                    const createResult = await octokit.graphql<{ createIssueType: { issueType: { id: string } } }>(`
                        mutation ($ownerId: ID!, $name: String!, $description: String!, $color: IssueTypeColor!, $isEnabled: Boolean!) {
                            createIssueType(input: { ownerId: $ownerId, name: $name, description: $description, color: $color, isEnabled: $isEnabled }) {
                                issueType { id }
                            }
                        }
                    `, {
                        ownerId: organization.id,
                        name: selected.name,
                        description: selected.description,
                        color: selected.color.toUpperCase(),
                        isEnabled: true,
                    });
                    issueTypeId = createResult.createIssueType.issueType.id;
                } catch (createError) {
                    logError(`Failed to create issue type "${selected.name}": ${createError}`);
                    logDebugInfo('Falling back to using labels for issue type classification');
                    return;
                }
            }

            await octokit.graphql(`
                mutation ($issueId: ID!, $issueTypeId: ID!) {
                    updateIssueIssueType(input: { issueId: $issueId, issueTypeId: $issueTypeId }) {
                        issue { id issueType { id name } }
                    }
                }
            `, { issueId, issueTypeId });
            logDebugInfo(`Successfully updated issue type to ${selected.name}`);
        } catch (error) {
            logError(`Failed to update issue type: ${error}`);
            logDebugInfo('Continuing with issue processing despite issue type update failure');
            throw error;
        }
    };

    private selectIssueType(labels: Labels, issueTypes: IssueTypes): SelectedIssueType {
        if (labels.isHotfix) return this.selected(issueTypes.hotfix, issueTypes.hotfixDescription, issueTypes.hotfixColor);
        if (labels.isRelease) return this.selected(issueTypes.release, issueTypes.releaseDescription, issueTypes.releaseColor);
        if (labels.isDocs || labels.isDocumentation) return this.selected(issueTypes.documentation, issueTypes.documentationDescription, issueTypes.documentationColor);
        if (labels.isChore || labels.isMaintenance) return this.selected(issueTypes.maintenance, issueTypes.maintenanceDescription, issueTypes.maintenanceColor);
        if (labels.isBugfix || labels.isBug) return this.selected(issueTypes.bug, issueTypes.bugDescription, issueTypes.bugColor);
        if (labels.isFeature || labels.isEnhancement) return this.selected(issueTypes.feature, issueTypes.featureDescription, issueTypes.featureColor);
        if (labels.isHelp) return this.selected(issueTypes.help, issueTypes.helpDescription, issueTypes.helpColor);
        if (labels.isQuestion) return this.selected(issueTypes.question, issueTypes.questionDescription, issueTypes.questionColor);
        return this.selected(issueTypes.task, issueTypes.taskDescription, issueTypes.taskColor);
    }

    private selected(name: string, description: string, color: string): SelectedIssueType {
        return { name, description, color };
    }
}
