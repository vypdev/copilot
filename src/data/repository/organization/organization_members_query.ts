import type { GithubOrganizationMembersClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";
import { ApplicationError } from '../../../application/errors/application_error';
import { withAssignmentProviderFailure } from '../github/assignment_provider_failure';

export async function listOrganizationTeams(
  client: GithubOrganizationMembersClient,
  organization: string,
): Promise<Array<{ slug: string }>> {
  return withAssignmentProviderFailure('list-teams', async () => {
    const teams: Array<{ slug: string }> = [];
    for await (const response of client.paginate.iterator(client.rest.teams.list, {
      org: organization,
      per_page: 100,
    })) {
      const page = response?.data;
      if (!Array.isArray(page) || !page.every(isTeam)) throw malformedMembers();
      teams.push(...page);
    }
    return teams;
  });
}

export async function listOrganizationTeamMembers(
  client: GithubOrganizationMembersClient,
  organization: string,
  teamSlug: string,
): Promise<Array<{ login: string }>> {
  return withAssignmentProviderFailure('list-team-members', async () => {
    const members: Array<{ login: string }> = [];
    for await (const response of client.paginate.iterator(client.rest.teams.listMembersInOrg, {
      org: organization,
      team_slug: teamSlug,
      per_page: 100,
    })) {
      const page = response?.data;
      if (!Array.isArray(page) || !page.every(isMember)) throw malformedMembers();
      members.push(...page);
    }
    return members;
  });
}

function isTeam(value: unknown): value is { slug: string } {
  return isRecord(value) && typeof value.slug === 'string' && value.slug.trim().length > 0;
}

function isMember(value: unknown): value is { login: string } {
  return isRecord(value) && typeof value.login === 'string' && value.login.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformedMembers(): ApplicationError {
  return new ApplicationError('provider.contract-invalid', 'Organization membership response is malformed.');
}
