export interface OrganizationTeam {
    slug: string;
}
export interface OrganizationMember {
    login: string;
}
export type ListTeamMembers = (teamSlug: string) => Promise<OrganizationMember[]>;
export declare function collectOrganizationMembers(teams: OrganizationTeam[], listTeamMembers: ListTeamMembers): Promise<string[]>;
export declare function selectAvailableMembers(members: string[], currentMembers: string[], requested: number): string[];
