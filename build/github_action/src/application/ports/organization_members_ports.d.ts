export interface OrganizationMembersPort {
    getRandomMembers(organization: string, membersToAdd: number, currentMembers: string[], token: string): Promise<string[]>;
    getAllMembers(organization: string, token: string): Promise<string[]>;
}
