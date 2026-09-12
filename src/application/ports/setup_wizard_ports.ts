import type {
    SetupConfiguration,
    SetupCredentialCheck,
    SetupCredentialDecision,
    SetupCredentialValue,
    SetupWorkflowComparison,
    DoctorCheck,
    SetupCredentialRequirement,
    SetupResourceTarget,
    SetupRemoteConfiguration,
} from '../../domain/setup';

export interface SetupRemoteConfigurationReadPort {
    inspect(owner: string, repository: string, token: string): Promise<SetupRemoteConfiguration>;
}

export interface SetupCredentialPromptPort {
    requestSetupPat(): Promise<string | undefined>;
    explainCredentialSeparation(requirements: readonly SetupCredentialRequirement[]): void;
    requestWorkflowPat(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined>;
    requestApiKey(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined>;
    chooseExistingCredential(requirement: SetupCredentialRequirement, check: SetupCredentialCheck): Promise<SetupCredentialDecision>;
    showCredentialChecks(checks: readonly SetupCredentialCheck[]): void;
}

export interface SetupRepositorySecretNamesQueryPort {
    list(owner: string, repository: string, token: string): Promise<readonly string[]>;
}

export interface SetupRepositorySecretsCommandPort {
    upsertSecrets(
        owner: string,
        repository: string,
        token: string,
        credentials: readonly SetupCredentialValue[],
    ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }>;
    upsertScopedSecrets?(
        owner: string,
        repository: string,
        token: string,
        target: SetupResourceTarget,
        credentials: readonly SetupCredentialValue[],
    ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }>;
}

export interface SetupRepositoryVariablesQueryPort {
    listVariables(owner: string, repository: string, token: string): Promise<readonly { name: string; value?: string }[]>;
}

export interface SetupMergeQueueReadinessRequest {
    owner: string;
    repository: string;
    token: string;
    configuration: SetupConfiguration;
}

export interface SetupMergeQueueReadinessPort {
    inspect(request: SetupMergeQueueReadinessRequest): Promise<readonly DoctorCheck[]>;
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

export interface SetupRepositoryVariablesCommandPort {
    upsert(
        owner: string,
        repository: string,
        token: string,
        variables: readonly { name: string; value: string }[],
    ): Promise<{ created: number; updated: number; errors: string[] }>;
    upsertScopedVariables?(
        owner: string,
        repository: string,
        token: string,
        target: SetupResourceTarget,
        variables: readonly { name: string; value: string }[],
    ): Promise<{ created: number; updated: number; errors: string[] }>;
}
