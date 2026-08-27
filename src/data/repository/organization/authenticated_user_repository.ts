import type { AuthenticatedUserPort } from "../../../application/ports/authenticated_user_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubAuthenticatedUserClient } from "../../../application/ports/github_identity_ports";

export class AuthenticatedUserRepository implements AuthenticatedUserPort {
    constructor(private readonly githubClient: GithubClientPort<GithubAuthenticatedUserClient>) {}
    getUserFromToken = async (token: string): Promise<string> => {
        const octokit = this.githubClient.getClient(token);
        const { data: user } = await octokit.rest.users.getAuthenticated();
        return user.login;
    };

    getTokenUserDetails = async (token: string): Promise<{ name: string; email: string }> => {
        const octokit = this.githubClient.getClient(token);
        const { data: user } = await octokit.rest.users.getAuthenticated();
        const name = (user.name ?? user.login ?? "GitHub Action").trim() || "GitHub Action";
        const email = typeof user.email === "string" && user.email.trim().length > 0
            ? user.email.trim()
            : `${user.login}@users.noreply.github.com`;
        return { name, email };
    };
}
