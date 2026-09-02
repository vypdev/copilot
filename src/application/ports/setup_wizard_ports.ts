import type {
    SetupConfiguration,
    SetupPlan,
    SetupCredentialCheck,
    SetupCredentialRequirement,
    SetupCredentialDecision,
    SetupCredentialValue,
    SetupWorkflowComparison,
    DoctorCheck,
} from '../../domain/setup';

export interface SetupPromptPort {
    collect(defaults: SetupConfiguration): Promise<SetupConfiguration>;
    showPlan(plan: SetupPlan): void;
    confirm(plan: SetupPlan): Promise<boolean>;
    close(): void;
}

export interface SetupCredentialPromptPort {
    requestSetupPat(): Promise<string | undefined>;
    explainCredentialSeparation(requirements: readonly SetupCredentialRequirement[]): void;
    requestWorkflowPat(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined>;
    requestApiKey(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined>;
    chooseExistingCredential(requirement: SetupCredentialRequirement, check: SetupCredentialCheck): Promise<SetupCredentialDecision>;
    showCredentialChecks(checks: readonly SetupCredentialCheck[]): void;
}

export interface SetupRepositorySecretsPort {
    list(owner: string, repository: string, token: string): Promise<readonly string[]>;
    upsertSecrets(
        owner: string,
        repository: string,
        token: string,
        credentials: readonly SetupCredentialValue[],
    ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }>;
}

export interface SetupRepositoryConfigurationReadPort {
    listVariables(owner: string, repository: string, token: string): Promise<readonly { name: string; value?: string }[]>;
}

export interface DoctorOutputPort {
    showDoctorChecks(checks: readonly DoctorCheck[]): void;
}

export interface SetupCredentialValidationPort {
    validateSetupPat(owner: string, repository: string, token: string): Promise<SetupCredentialCheck>;
    validateCredential(requirement: SetupCredentialRequirement, value: string): Promise<SetupCredentialCheck>;
}

export interface SetupRemoteCredentialHealthPort {
    validateExisting(
        owner: string,
        repository: string,
        token: string,
        ref: string,
        requirements: readonly SetupCredentialRequirement[],
    ): Promise<readonly SetupCredentialCheck[] | undefined>;
}

export interface SetupWorkflowUpdatePromptPort {
    confirmWorkflowUpdates(comparisons: readonly SetupWorkflowComparison[], forcedByFlag: boolean): Promise<boolean>;
}

export interface SetupRepositoryVariablesPort {
    upsert(
        owner: string,
        repository: string,
        token: string,
        variables: readonly { name: string; value: string }[],
    ): Promise<{ created: number; updated: number; errors: string[] }>;
}
