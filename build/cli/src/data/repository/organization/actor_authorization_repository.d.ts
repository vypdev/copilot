import type { ActorAuthorizationPort } from "../../../application/ports/actor_authorization_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubActorAuthorizationClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";
export declare class ActorAuthorizationRepository implements ActorAuthorizationPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubActorAuthorizationClient>);
    isActorAllowedToModifyFiles: (owner: string, actor: string, token: string) => Promise<boolean>;
    private checkOrganizationMembership;
}
