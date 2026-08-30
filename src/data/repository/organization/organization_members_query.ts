import type { GithubOrganizationMembersClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";

export async function listOrganizationTeams(
  client: GithubOrganizationMembersClient,
  organization: string,
): Promise<Array<{ slug: string }>> {
  const teams: Array<{ slug: string }> = [];
  for await (const response of client.paginate.iterator(client.rest.teams.list, {
    org: organization,
    per_page: 100,
  })) {
    teams.push(...response.data.filter((team): team is { slug: string } => "slug" in team));
  }
  return teams;
}

export async function listOrganizationTeamMembers(
  client: GithubOrganizationMembersClient,
  organization: string,
  teamSlug: string,
): Promise<Array<{ login: string }>> {
  const members: Array<{ login: string }> = [];
  for await (const response of client.paginate.iterator(client.rest.teams.listMembersInOrg, {
    org: organization,
    team_slug: teamSlug,
    per_page: 100,
  })) {
    members.push(...response.data.filter((member): member is { login: string } => "login" in member));
  }
  return members;
}
