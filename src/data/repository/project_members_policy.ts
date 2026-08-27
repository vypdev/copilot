export interface OrganizationTeam {
  slug: string;
}

export interface OrganizationMember {
  login: string;
}

export type ListTeamMembers = (
  teamSlug: string,
) => Promise<OrganizationMember[]>;

export async function collectOrganizationMembers(
  teams: OrganizationTeam[],
  listTeamMembers: ListTeamMembers,
): Promise<string[]> {
  const members = new Map<string, string>();
  for (const team of teams) {
    const teamMembers = await listTeamMembers(team.slug);
    teamMembers.forEach((member) => {
      const identity = member.login.toLowerCase();
      if (!members.has(identity)) members.set(identity, member.login);
    });
  }
  return [...members.values()];
}

export function selectAvailableMembers(
  members: string[],
  currentMembers: string[],
  requested: number,
): string[] {
  const excludedIdentities = new Set(
    currentMembers.map((member) => member.toLowerCase()),
  );
  const availableByIdentity = new Map<string, string>();
  for (const member of members) {
    const identity = member.toLowerCase();
    if (
      !excludedIdentities.has(identity) &&
      !availableByIdentity.has(identity)
    ) {
      availableByIdentity.set(identity, member);
    }
  }
  const available = [...availableByIdentity.values()];
  if (requested >= available.length) return available;
  return available.sort(() => Math.random() - 0.5).slice(0, requested);
}
