export type ModificationAuthorization =
    | { kind: 'owner'; allowed: boolean }
    | { kind: 'organization-membership'; organization: string; actor: string };

export function authorizationForFileModification(
    owner: string,
    actor: string,
    ownerType: string,
): ModificationAuthorization {
    if (ownerType === 'Organization') {
        return { kind: 'organization-membership', organization: owner, actor };
    }
    return { kind: 'owner', allowed: actor === owner };
}
