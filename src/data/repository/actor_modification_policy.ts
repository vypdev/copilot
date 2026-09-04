import { githubUsersMatch } from '../../domain/github_user_policy';

export type ModificationAuthorization =
    | { kind: 'organization-membership'; organization: string; actor: string }
    | { kind: 'user-repository-collaborator'; owner: string; actor: string; ownerMatches: boolean };

export function authorizationForFileModification(
    owner: string,
    actor: string,
    ownerType: string,
): ModificationAuthorization {
    if (ownerType === 'Organization') {
        return { kind: 'organization-membership', organization: owner, actor };
    }
    return {
        kind: 'user-repository-collaborator',
        owner,
        actor,
        ownerMatches: githubUsersMatch(actor, owner),
    };
}
