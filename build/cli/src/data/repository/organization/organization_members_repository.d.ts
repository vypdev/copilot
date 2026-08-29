import type { OrganizationMembersPort } from "../../../application/ports/organization_members_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubOrganizationMembersClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";
export declare class OrganizationMembersRepository implements OrganizationMembersPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubOrganizationMembersClient>);
    private listAllTeams;
    private listAllTeamMembers;
    getRandomMembers: (organization: string, membersToAdd: number, currentMembers: string[], token: string) => Promise<string[]>;
    getAllMembers: (organization: string, token: string) => Promise<string[]>;
}
