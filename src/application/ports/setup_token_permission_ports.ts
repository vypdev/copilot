import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionReport,
    SetupTokenPermissionRequirement,
    SetupTokenRole,
} from '../../domain/setup_token_permissions';

export interface SetupTokenPermissionsRequest {
    role: SetupTokenRole;
    owner: string;
    repository: string;
    token: string;
    requirements: readonly SetupTokenPermissionRequirement[];
}

/** Read-only capability boundary. Implementations must never probe with mutations. */
export interface SetupTokenPermissionQueryPort {
    inspect(
        owner: string,
        repository: string,
        token: string,
        requirements: readonly SetupTokenPermissionRequirement[],
    ): Promise<readonly SetupTokenPermissionCheck[]>;
}

export interface SetupTokenPermissionPresenterPort {
    showRequirements(role: SetupTokenRole, requirements: readonly SetupTokenPermissionRequirement[]): void;
    showReport(report: SetupTokenPermissionReport): void;
}

export interface SetupTokenPermissionAuditPort {
    inspect(request: SetupTokenPermissionsRequest): Promise<SetupTokenPermissionReport>;
}
