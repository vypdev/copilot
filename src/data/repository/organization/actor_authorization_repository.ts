import { logDebugInfo } from "../../../utils/logger";
import { authorizationForFileModification } from "../actor_modification_policy";
import type { ActorAuthorizationPort } from "../../../application/ports/actor_authorization_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubActorAuthorizationClient } from "../../../infrastructure/github/ports/github_identity_provider_ports";

export class ActorAuthorizationRepository implements ActorAuthorizationPort {
    constructor(private readonly githubClient: GithubClientPort<GithubActorAuthorizationClient>) {}
    isActorAllowedToModifyFiles = async (owner: string, repo: string, actor: string, token: string): Promise<boolean> => {
        try {
            const octokit = this.githubClient.getClient(token);
            const { data: ownerUser } = await octokit.rest.users.getByUsername({ username: owner });
            const authorization = authorizationForFileModification(owner, actor, ownerUser.type);
            if (authorization.kind === 'organization-membership') {
                return this.checkOrganizationMembership(octokit, authorization.organization, authorization.actor, owner, actor);
            }
            if (authorization.ownerMatches) return true;
            return this.checkUserRepositoryPermission(octokit, owner, actor, repo);
        } catch (err) {
            logDebugInfo(`isActorAllowedToModifyFiles(${owner}, ${repo}, ${actor}): ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    };

    private async checkOrganizationMembership(
        octokit: GithubActorAuthorizationClient,
        organization: string,
        actor: string,
        owner: string,
        originalActor: string,
    ): Promise<boolean> {
        try {
            await octokit.rest.orgs.checkMembershipForUser({ org: organization, username: actor });
            return true;
        } catch (membershipErr: unknown) {
            logUnlessNotFound(
                membershipErr,
                `checkMembershipForUser(${owner}, ${originalActor})`,
            );
            return false;
        }
    }

    private async checkUserRepositoryPermission(
        octokit: GithubActorAuthorizationClient,
        owner: string,
        actor: string,
        repo: string,
    ): Promise<boolean> {
        try {
            const response = await octokit.rest.repos.getCollaboratorPermissionLevel({
                owner,
                repo,
                username: actor,
            });
            return ['admin', 'maintain', 'push'].includes(response.data.permission ?? '');
        } catch (permissionErr: unknown) {
            logUnlessNotFound(
                permissionErr,
                `getCollaboratorPermissionLevel(${owner}, ${repo}, ${actor})`,
            );
            return false;
        }
    }
}

function logUnlessNotFound(error: unknown, operation: string): void {
    if ((error as { status?: number })?.status === 404) return;
    logDebugInfo(`${operation}: ${error instanceof Error ? error.message : String(error)}`);
}
