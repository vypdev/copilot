import type { GithubOrganizationMembersClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";
import { requireArrayPage } from "../github/github_pagination_policy";

export async function listOrganizationTeams(
  client: GithubOrganizationMembersClient,
  organization: string,
): Promise<Array<{ slug: string }>> {
  const teams: Array<{ slug: string }> = [];
  for await (const response of client.paginate.iterator(client.rest.teams.list, {
    org: organization,
    per_page: 100,
  })) {
    const page = requireArrayPage<unknown>(response.data, 'organization teams');
    teams.push(...page.flatMap((team) => isTeam(team) ? [team] : []));
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
    const page = requireArrayPage<unknown>(response.data, 'organization team members');
    members.push(...page.flatMap((member) => isMember(member) ? [member] : []));
  }
  return members;
}

function isTeam(value: unknown): value is { slug: string } {
  return isRecord(value) && typeof value.slug === 'string';
}

function isMember(value: unknown): value is { login: string } {
  return isRecord(value) && typeof value.login === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
