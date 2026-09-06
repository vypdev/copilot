export type ModificationAuthorization = {
    kind: 'organization-membership';
    organization: string;
    actor: string;
} | {
    kind: 'user-repository-collaborator';
    owner: string;
    actor: string;
    ownerMatches: boolean;
};
export declare function authorizationForFileModification(owner: string, actor: string, ownerType: string): ModificationAuthorization;
