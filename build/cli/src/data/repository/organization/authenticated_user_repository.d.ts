import type { AuthenticatedUserPort } from "../../../application/ports/authenticated_user_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubAuthenticatedUserClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";
export declare class AuthenticatedUserRepository implements AuthenticatedUserPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubAuthenticatedUserClient>);
    getUserFromToken: (token: string) => Promise<string>;
    getTokenUserDetails: (token: string) => Promise<{
        name: string;
        email: string;
    }>;
}
