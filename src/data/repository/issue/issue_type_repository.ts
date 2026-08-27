import { logError } from "../../../utils/logger";
import { IssueTypes } from '../../model/issue_types';
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";

export type IssueType = { id: string; name: string };
export type IssueTypeEnsureResult = { created: boolean; existed: boolean };
export type IssueTypeEnsureSummary = { created: number; existing: number; errors: string[] };

export class IssueTypeRepository {
    constructor(private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>) {}
    listIssueTypes = async (owner: string, token: string): Promise<IssueType[]> => {
        const octokit = this.graphqlClient.getClient(token);
        const { organization } = await octokit.graphql<{ organization: { id: string; issueTypes: { nodes: IssueType[] } } | null }>(`
            query ($owner: String!) {
                organization(login: $owner) {
                    id
                    issueTypes(first: 20) { nodes { id name } }
                }
            }
        `, { owner });
        if (!organization) throw new Error(`No se pudo obtener la organización ${owner}`);
        return organization.issueTypes.nodes;
    };

    createIssueType = async (
        owner: string,
        name: string,
        description: string,
        color: string,
        token: string,
    ): Promise<string> => {
        const octokit = this.graphqlClient.getClient(token);
        const { organization } = await octokit.graphql<{ organization: { id: string } | null }>(`
            query ($owner: String!) { organization(login: $owner) { id } }
        `, { owner });
        if (!organization) throw new Error(`No se pudo obtener la organización ${owner}`);

        const result = await octokit.graphql<{ createIssueType: { issueType: { id: string } } }>(`
            mutation ($ownerId: ID!, $name: String!, $description: String!, $color: IssueTypeColor!, $isEnabled: Boolean!) {
                createIssueType(input: { ownerId: $ownerId, name: $name, description: $description, color: $color, isEnabled: $isEnabled }) {
                    issueType { id }
                }
            }
        `, { ownerId: organization.id, name, description, color: color.toUpperCase(), isEnabled: true });
        return result.createIssueType.issueType.id;
    };

    ensureIssueType = async (
        owner: string,
        name: string,
        description: string,
        color: string,
        token: string,
    ): Promise<IssueTypeEnsureResult> => {
        try {
            const existingTypes = await this.listIssueTypes(owner, token);
            if (existingTypes.some(type => type.name.toLowerCase() === name.toLowerCase())) {
                return { created: false, existed: true };
            }
            await this.createIssueType(owner, name, description, color, token);
            return { created: true, existed: false };
        } catch (error) {
            logError(`Error ensuring issue type "${name}": ${error}`);
            throw error;
        }
    };

    ensureIssueTypes = async (
        owner: string,
        issueTypes: IssueTypes,
        token: string,
    ): Promise<IssueTypeEnsureSummary> => {
        const configured = [
            [issueTypes.task, issueTypes.taskDescription, issueTypes.taskColor],
            [issueTypes.bug, issueTypes.bugDescription, issueTypes.bugColor],
            [issueTypes.feature, issueTypes.featureDescription, issueTypes.featureColor],
            [issueTypes.documentation, issueTypes.documentationDescription, issueTypes.documentationColor],
            [issueTypes.maintenance, issueTypes.maintenanceDescription, issueTypes.maintenanceColor],
            [issueTypes.hotfix, issueTypes.hotfixDescription, issueTypes.hotfixColor],
            [issueTypes.release, issueTypes.releaseDescription, issueTypes.releaseColor],
            [issueTypes.question, issueTypes.questionDescription, issueTypes.questionColor],
            [issueTypes.help, issueTypes.helpDescription, issueTypes.helpColor],
        ] as const;
        let created = 0;
        let existing = 0;
        const errors: string[] = [];
        for (const [name, description, color] of configured) {
            try {
                const result = await this.ensureIssueType(owner, name, description, color, token);
                if (result.created) created++;
                else existing++;
            } catch (error: unknown) {
                const message = (error as { message?: string }).message || error;
                logError(`Error ensuring issue type "${name}": ${error}`);
                errors.push(`Error creando tipo de Issue "${name}": ${message}`);
            }
        }
        return { created, existing, errors };
    };
}
