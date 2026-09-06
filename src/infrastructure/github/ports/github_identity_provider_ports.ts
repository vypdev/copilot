export interface GithubOwnerTypeClient {
    rest: {
        users: {
            getByUsername(parameters: {
                username: string;
            }): Promise<{ data: { type?: string } }>;
        };
    };
}

export interface GithubAuthenticatedUserClient {
    rest: {
        users: {
            getAuthenticated(): Promise<{ data: { login: string; name?: string | null; email?: string | null } }>;
        };
    };
}

export interface GithubActorAuthorizationClient {
    rest: {
        users: {
            getByUsername(parameters: { username: string }): Promise<{ data: { type: string } }>;
        };
        orgs: {
            checkMembershipForUser(parameters: { org: string; username: string }): Promise<unknown>;
        };
        repos: {
            getCollaboratorPermissionLevel(parameters: {
                owner: string;
                repo: string;
                username: string;
            }): Promise<{ data: { permission?: string } }>;
        };
    };
}

export interface GithubOrganizationMembersClient {
    paginate: {
        iterator(
            method: (parameters: Record<string, unknown>) => Promise<{ data: Array<{ slug: string } | { login: string }> }>,
            parameters: Record<string, unknown>,
        ): AsyncIterable<{ data: Array<{ slug: string } | { login: string }> }>;
    };
    rest: {
        teams: {
            list(parameters: Record<string, unknown>): Promise<{ data: Array<{ slug: string }> }>;
            listMembersInOrg(parameters: Record<string, unknown>): Promise<{ data: Array<{ login: string }> }>;
        };
    };
}
