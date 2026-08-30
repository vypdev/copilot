import type { GithubOrganizationMembersClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";
export declare function listOrganizationTeams(client: GithubOrganizationMembersClient, organization: string): Promise<Array<{
    slug: string;
}>>;
export declare function listOrganizationTeamMembers(client: GithubOrganizationMembersClient, organization: string, teamSlug: string): Promise<Array<{
    login: string;
}>>;
