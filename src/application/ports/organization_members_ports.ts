export interface OrganizationMembersPort {
    getRandomMembers(organization: string, membersToAdd: number, currentMembers: string[], token: string): Promise<string[]>;
    getAllMembers(organization: string, token: string): Promise<string[]>;
}

/** Repository-credential-bound member lookup for permission decisions. */
export interface BoundOrganizationMembersPort {
    getAllMembers(): Promise<readonly string[]>;
}

/** Bound organization membership queries used for deterministic assignment. */
export interface BoundOrganizationMemberSelectionPort extends BoundOrganizationMembersPort {
    getRandomMembers(membersToAdd: number, currentMembers: readonly string[]): Promise<readonly string[]>;
}
