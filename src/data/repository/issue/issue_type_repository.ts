import { logError } from '../../../utils/logger';
import type { IssueTypes } from '../../model/issue_types';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import { configuredIssueTypes, type ConfiguredIssueType } from './issue_type_configuration';

export type IssueType = { id: string; name: string };
export type IssueTypeEnsureResult = { created: boolean; existed: boolean };
export type IssueTypeEnsureSummary = { created: number; existing: number; errors: string[] };

interface IssueTypePage {
    organization: {
        issueTypes: {
            nodes: IssueType[];
            pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
    } | null;
}

const ISSUE_TYPES_QUERY = `
    query ($owner: String!, $after: String) {
        organization(login: $owner) {
            issueTypes(first: 100, after: $after) {
                nodes { id name }
                pageInfo { hasNextPage endCursor }
            }
        }
    }
`;

const ORGANIZATION_ID_QUERY = `
    query ($owner: String!) { organization(login: $owner) { id } }
`;

const CREATE_ISSUE_TYPE_MUTATION = `
    mutation ($ownerId: ID!, $name: String!, $description: String!, $color: IssueTypeColor!, $isEnabled: Boolean!) {
        createIssueType(input: { ownerId: $ownerId, name: $name, description: $description, color: $color, isEnabled: $isEnabled }) {
            issueType { id }
        }
    }
`;

export class IssueTypeRepository {
    constructor(private readonly graphqlClient: GithubClientPort<GithubGraphqlTransportClient>) {}

    listIssueTypes = async (owner: string, token: string): Promise<IssueType[]> => {
        const client = this.graphqlClient.getClient(token);
        const issueTypes: IssueType[] = [];
        let cursor: string | null = null;

        for (let page = 1; page <= 100; page += 1) {
            const response = await this.fetchIssueTypePage(client, owner, cursor);
            const organization = response.organization;
            if (!organization) throw new Error(`No se pudo obtener la organización ${owner}`);

            issueTypes.push(...organization.issueTypes.nodes);
            const pageInfo = organization.issueTypes.pageInfo;
            if (!pageInfo?.hasNextPage) return issueTypes;
            if (!pageInfo.endCursor) {
                throw new Error(`La paginación de tipos de Issue no devolvió cursor en la página ${page}.`);
            }
            cursor = pageInfo.endCursor;
        }

        throw new Error('La paginación de tipos de Issue superó 100 páginas.');
    };

    createIssueType = async (
        owner: string,
        name: string,
        description: string,
        color: string,
        token: string,
    ): Promise<string> => {
        const client = this.graphqlClient.getClient(token);
        const organization = await this.fetchOrganization(client, owner);
        if (!organization) throw new Error(`No se pudo obtener la organización ${owner}`);

        const result = await client.graphql<{ createIssueType: { issueType: { id: string } } }>(
            CREATE_ISSUE_TYPE_MUTATION,
            { ownerId: organization.id, name, description, color: color.toUpperCase(), isEnabled: true },
        );
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
        let created = 0;
        let existing = 0;
        const errors: string[] = [];

        for (const configured of configuredIssueTypes(issueTypes)) {
            try {
                const result = await this.ensureConfiguredIssueType(owner, configured, token);
                if (result.created) created += 1;
                else existing += 1;
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`Error ensuring issue type "${configured.name}": ${error}`);
                errors.push(`Error creando tipo de Issue "${configured.name}": ${message}`);
            }
        }

        return { created, existing, errors };
    };

    private ensureConfiguredIssueType(
        owner: string,
        configured: ConfiguredIssueType,
        token: string,
    ): Promise<IssueTypeEnsureResult> {
        return this.ensureIssueType(
            owner,
            configured.name,
            configured.description,
            configured.color,
            token,
        );
    }

    private async fetchIssueTypePage(
        client: GithubGraphqlTransportClient,
        owner: string,
        cursor: string | null,
    ): Promise<IssueTypePage> {
        return client.graphql<IssueTypePage>(ISSUE_TYPES_QUERY, { owner, after: cursor });
    }

    private async fetchOrganization(
        client: GithubGraphqlTransportClient,
        owner: string,
    ): Promise<{ id: string } | null> {
        const response = await client.graphql<{ organization: { id: string } | null }>(
            ORGANIZATION_ID_QUERY,
            { owner },
        );
        return response.organization;
    }
}
