export type SetupTokenRole = 'setup' | 'workflow';
export type SetupTokenPermissionScope = 'repository' | 'organization';
export type SetupTokenPermissionLevel = 'read' | 'write';
export type SetupTokenPermissionApplicability = 'required' | 'conditional';
export type SetupTokenPermissionStatus = 'verified' | 'available' | 'missing' | 'unverifiable';
export type SetupTokenPermissionProbePhase = 'checking' | 'creating' | 'reading' | 'deleting' | 'verified' | 'failed' | 'skipped';
export type SetupActionsProbePrerequisite = 'contents-write' | 'contents-workflows-write' | 'dispatch-workflow';
export type SetupTokenPermissionProgressDetail = 'unavailable' | 'cleanup-pending' | 'secret-collision' | 'unsupported' | SetupActionsProbePrerequisite | `http-${number}` | `issue-closed-${number}` | `issue-unresolved-${number}`;

/** Secret-free, bounded progress for one permission. Never contains provider prose. */
export interface SetupTokenPermissionProgress {
    readonly role: SetupTokenRole;
    readonly requirementId: string;
    readonly phase: SetupTokenPermissionProbePhase;
    readonly detail?: SetupTokenPermissionProgressDetail;
}
export type SetupTokenPublicReadEvidence = 'public-repository' | 'public-organization-projects';

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
    /** A successful public repository read is usable, but does not prove a PAT grant. */
    operationallyAvailable?: true;
    /** Adapter-derived public-read provenance, never a PAT permission claim. */
    publicReadEvidence?: SetupTokenPublicReadEvidence;
    /** Set only after a matching temporary create/read/delete cycle completed. */
    writeProof?: 'transaction';
    /** A disposable resource may remain or a concurrent Secret may have changed. */
    cleanupPending?: true;
    /** GitHub's upsert-only Secret endpoint reported an existing object. */
    incident?: 'secret-collision';
    /** An Actions check stopped before dispatch; this is not evidence against Actions Write. */
    prerequisite?: SetupActionsProbePrerequisite;
}

export interface SetupTokenPermissionReport {
    role: SetupTokenRole;
    account?: string;
    identityStatus: 'valid' | 'invalid' | 'unverifiable';
    identityMessage: string;
    checks: readonly SetupTokenPermissionCheck[];
    /** All required reads are usable, writes have transaction proof, and no cleanup or incident remains. */
    ready: boolean;
    /** Compatibility field; permission assertions cannot replace transaction proof and this stays false. */
    confirmationRequired: boolean;
}
