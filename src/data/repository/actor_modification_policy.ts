import { githubUsersMatch } from '../../domain/github_user_policy';

export type MemberOnlyAuthorization =
    | { kind: 'organization-membership'; organization: string; actor: string }
    | { kind: 'user-repository-collaborator'; owner: string; actor: string; ownerMatches: boolean };

export interface ModificationAuthorization {
    kind: 'repository-collaborator';
    owner: string;
    actor: string;
    ownerMatches: boolean;
}

export function authorizationForFileModification(
    owner: string,
    actor: string,
    ownerType: string,
): ModificationAuthorization {
    return {
        kind: 'repository-collaborator',
        owner,
        actor,
        ownerMatches: ownerType === 'User' && githubUsersMatch(actor, owner),
    };
}

export function authorizationForMemberOnlyAutomation(
    owner: string,
    actor: string,
    ownerType: string,
): MemberOnlyAuthorization {
    if (ownerType === 'Organization') {
        return { kind: 'organization-membership', organization: owner, actor };
    }
    return {
        kind: 'user-repository-collaborator',
        owner,
        actor,
        ownerMatches: ownerType === 'User' && githubUsersMatch(actor, owner),
    };
}
