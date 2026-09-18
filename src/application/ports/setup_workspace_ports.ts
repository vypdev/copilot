import type { SetupConfiguration, SetupFeatures, SetupWorkflowComparison } from '../../domain/setup';

export interface SetupWorkspaceResult {
    copied: number;
    skipped: number;
}

export interface SetupWorkspaceSelection {
    features?: SetupFeatures;
    updateExistingWorkflows?: boolean;
    approvedWorkflowFiles?: readonly string[];
    setupConfiguration?: Readonly<SetupConfiguration>;
}

export interface SetupWorkspacePort {
    prepare(selection?: SetupWorkspaceSelection): SetupWorkspaceResult;
    hasValidToken(tokenOverride?: string): boolean;
}

export interface BoundSetupWorkspacePort {
    prepare(selection?: SetupWorkspaceSelection): SetupWorkspaceResult;
    hasValidToken(): boolean;
}

/** Read-only local facts used by doctor; it exposes no workspace mutation. */
export interface SetupDoctorWorkspaceQueryPort {
    isRepositoryRoot(): boolean;
    compareWorkflows(features?: SetupFeatures, configuration?: Readonly<SetupConfiguration>): readonly SetupWorkflowComparison[];
    inspectAgentGuidance?(configuration: Readonly<SetupConfiguration>): readonly {
        id: string;
        status: 'pass' | 'warn' | 'fail' | 'skipped';
        summary: string;
        path?: string;
    }[];
}
