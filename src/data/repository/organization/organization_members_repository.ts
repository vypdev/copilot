import { logDebugInfo, logError } from "../../../utils/logger";
import { collectOrganizationMembers, selectAvailableMembers } from "../project_members_policy";
import type { OrganizationMembersPort } from "../../../application/ports/organization_members_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubOrganizationMembersClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";
import { listOrganizationTeamMembers, listOrganizationTeams } from "./organization_members_query";

export class OrganizationMembersRepository implements OrganizationMembersPort {
  constructor(private readonly githubClient: GithubClientPort<GithubOrganizationMembersClient>) {}

  getRandomMembers = async (
    organization: string,
    membersToAdd: number,
    currentMembers: string[],
    token: string,
  ): Promise<string[]> => {
    if (membersToAdd === 0) return [];
    try {
      const client = this.githubClient.getClient(token);
      const teams = await listOrganizationTeams(client, organization);
      if (teams.length === 0) {
        logDebugInfo(`${organization} doesn't have any team.`);
        return [];
      }
      const allMembers = await collectOrganizationMembers(
        teams,
        (teamSlug) => listOrganizationTeamMembers(client, organization, teamSlug),
      );
      const selectedMembers = selectAvailableMembers(allMembers, currentMembers, membersToAdd);
      if (selectedMembers.length === 0) {
        logDebugInfo(`No available members to assign for organization ${organization}.`);
      }
      return selectedMembers;
    } catch (error) {
      logError(`Error getting random members: ${error}.`);
      throw error;
    }
  };

  getAllMembers = async (organization: string, token: string): Promise<string[]> => {
    try {
      const client = this.githubClient.getClient(token);
      const teams = await listOrganizationTeams(client, organization);
      if (teams.length === 0) {
        logDebugInfo(`${organization} doesn't have any team.`);
        return [];
      }
      return collectOrganizationMembers(
        teams,
        (teamSlug) => listOrganizationTeamMembers(client, organization, teamSlug),
      );
    } catch (error) {
      logError(`Error getting all members: ${error}.`);
      throw error;
    }
  };
}
