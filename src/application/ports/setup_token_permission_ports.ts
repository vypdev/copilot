import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionReport,
    SetupTokenPermissionRequirement,
    SetupTokenPermissionProgress,
    SetupTokenRole,
} from '../../domain/setup_token_permissions';

export interface SetupTokenPermissionsRequest {
    role: SetupTokenRole;
    owner: string;
    repository: string;
    token: string;
    requirements: readonly SetupTokenPermissionRequirement[];
    /** Canonical comma-separated Project numbers from the approved setup plan. */
    selectedProjectNumbers?: string;
}

/** Capability boundary. Writes use isolated, cleanup-verified transactions. */
export interface SetupTokenPermissionInspectionPort {
    inspect(
        owner: string,
        repository: string,
        token: string,
        requirements: readonly SetupTokenPermissionRequirement[],
        onProgress?: (progress: SetupTokenPermissionProgress) => void,
        selectedProjectNumbers?: string,
    ): Promise<readonly SetupTokenPermissionCheck[]>;
}

export interface SetupTokenPermissionPresenterPort {
    showRequirements(role: SetupTokenRole, requirements: readonly SetupTokenPermissionRequirement[]): void;
    showReport(report: SetupTokenPermissionReport): void;
    showProgress?(progress: SetupTokenPermissionProgress): void;
}

export interface SetupTokenPermissionAuditPort {
    inspect(request: SetupTokenPermissionsRequest): Promise<SetupTokenPermissionReport>;
}
