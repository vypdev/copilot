export type SetupTokenRole = 'setup' | 'workflow';
export type SetupTokenPermissionScope = 'repository' | 'organization';
export type SetupTokenPermissionLevel = 'read' | 'write';
export type SetupTokenPermissionApplicability = 'required' | 'conditional';
export type SetupTokenPermissionStatus = 'verified' | 'missing' | 'unverifiable';

export type SetupTokenPermissionProbe =
    | 'metadata'
    | 'contents'
    | 'administration'
    | 'issues'
    | 'actions'
    | 'checks'
    | 'pull-requests'
    | 'variables'
    | 'secrets'
    | 'workflows'
    | 'members'
    | 'issue-types'
    | 'projects';

/** Secret-free permission metadata derived from selected setup capabilities. */
export interface SetupTokenPermissionRequirement {
    id: string;
    role: SetupTokenRole;
    scope: SetupTokenPermissionScope;
    permission: string;
    level: SetupTokenPermissionLevel;
    applicability: SetupTokenPermissionApplicability;
    reason: string;
    condition?: string;
    probe: SetupTokenPermissionProbe;
}

export interface SetupTokenPermissionCheck extends SetupTokenPermissionRequirement {
    status: SetupTokenPermissionStatus;
    message: string;
}

export interface SetupTokenPermissionReport {
    role: SetupTokenRole;
    account?: string;
    identityStatus: 'valid' | 'invalid' | 'unverifiable';
    identityMessage: string;
    checks: readonly SetupTokenPermissionCheck[];
    ready: boolean;
}
