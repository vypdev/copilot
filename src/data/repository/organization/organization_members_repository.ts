import { logDebugInfo, logError } from "../../../utils/logger";
import { collectOrganizationMembers, selectAvailableMembers } from "../project_members_policy";
import type { OrganizationMembersPort } from "../../../application/ports/organization_members_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubOrganizationMembersClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";

export class OrganizationMembersRepository implements OrganizationMembersPort {
    constructor(private readonly githubClient: GithubClientPort<GithubOrganizationMembersClient>) {}

    private async listAllTeams(organization: string, token: string): Promise<Array<{ slug: string }>> {
        const octokit = this.githubClient.getClient(token);
        const teams: Array<{ slug: string }> = [];
        for await (const response of octokit.paginate.iterator(octokit.rest.teams.list, {
            org: organization,
            per_page: 100,
        })) {
            teams.push(...response.data.filter((team): team is { slug: string } => 'slug' in team));
        }
        return teams;
    }

    private async listAllTeamMembers(
        organization: string,
        teamSlug: string,
        token: string,
    ): Promise<Array<{ login: string }>> {
        const octokit = this.githubClient.getClient(token);
        const members: Array<{ login: string }> = [];
        for await (const response of octokit.paginate.iterator(octokit.rest.teams.listMembersInOrg, {
            org: organization,
            team_slug: teamSlug,
            per_page: 100,
        })) {
            members.push(...response.data.filter((member): member is { login: string } => 'login' in member));
        }
        return members;
    }

    getRandomMembers = async (
        organization: string,
        membersToAdd: number,
        currentMembers: string[],
        token: string,
    ): Promise<string[]> => {
        if (membersToAdd === 0) return [];
        try {
            const teams = await this.listAllTeams(organization, token);
            if (teams.length === 0) {
                logDebugInfo(`${organization} doesn't have any team.`);
                return [];
            }
            const allMembers = await collectOrganizationMembers(
                teams,
                (teamSlug) => this.listAllTeamMembers(organization, teamSlug, token),
            );
            const selectedMembers = selectAvailableMembers(allMembers, currentMembers, membersToAdd);
            if (selectedMembers.length === 0) logDebugInfo(`No available members to assign for organization ${organization}.`);
            return selectedMembers;
        } catch (error) {
            logError(`Error getting random members: ${error}.`);
            throw error;
        }
    };

    getAllMembers = async (organization: string, token: string): Promise<string[]> => {
        try {
            const teams = await this.listAllTeams(organization, token);
            if (teams.length === 0) {
                logDebugInfo(`${organization} doesn't have any team.`);
                return [];
            }
            return await collectOrganizationMembers(
                teams,
                (teamSlug) => this.listAllTeamMembers(organization, teamSlug, token),
            );
        } catch (error) {
            logError(`Error getting all members: ${error}.`);
            throw error;
        }
    };
}
