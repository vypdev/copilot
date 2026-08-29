import type { IssueTypes } from '../../model/issue_types';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
export type IssueType = {
    id: string;
    name: string;
};
export type IssueTypeEnsureResult = {
    created: boolean;
    existed: boolean;
};
export type IssueTypeEnsureSummary = {
    created: number;
    existing: number;
    errors: string[];
};
export declare class IssueTypeRepository {
    private readonly graphqlClient;
    constructor(graphqlClient: GithubClientPort<GithubGraphqlTransportClient>);
    listIssueTypes: (owner: string, token: string) => Promise<IssueType[]>;
    createIssueType: (owner: string, name: string, description: string, color: string, token: string) => Promise<string>;
    ensureIssueType: (owner: string, name: string, description: string, color: string, token: string) => Promise<IssueTypeEnsureResult>;
    ensureIssueTypes: (owner: string, issueTypes: IssueTypes, token: string) => Promise<IssueTypeEnsureSummary>;
    private ensureConfiguredIssueType;
    private fetchIssueTypePage;
    private fetchOrganization;
}
