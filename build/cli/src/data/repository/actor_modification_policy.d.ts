export type ModificationAuthorization = {
    kind: 'owner';
    allowed: boolean;
} | {
    kind: 'organization-membership';
    organization: string;
    actor: string;
};
export declare function authorizationForFileModification(owner: string, actor: string, ownerType: string): ModificationAuthorization;
