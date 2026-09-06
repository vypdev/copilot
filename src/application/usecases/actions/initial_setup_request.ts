import type { Execution } from '../../../data/model/execution';
import type { IssueTypes } from '../../../data/model/issue_types';
import type { Labels } from '../../../data/model/labels';
import type {
    SetupConfiguration,
    SetupCredentialCollection,
    SetupRemoteConfiguration,
} from '../../../domain/setup';
import type { SetupRepositoryContext } from './setup_resource_provisioning';

/** Narrow input assembled by the execution adapter for the setup workflow. */
export interface InitialSetupRequest extends SetupRepositoryContext {
    labels: Labels;
    issueTypes: IssueTypes;
    setupConfiguration?: SetupConfiguration;
    workflowUpdates: readonly string[];
}

/** Converts the legacy execution aggregate into the setup use case's explicit request. */
export function createInitialSetupRequest(execution: Execution): InitialSetupRequest {
    return {
        owner: execution.owner,
        repo: execution.repo,
        token: execution.tokens.token,
        labels: execution.labels,
        issueTypes: execution.issueTypes,
        setupConfiguration: asObject<SetupConfiguration>(execution.inputs?.setupConfiguration),
        setupCredentials: asObject<SetupCredentialCollection>(execution.inputs?.setupCredentials),
        setupRemoteConfiguration: asObject<SetupRemoteConfiguration>(execution.inputs?.setupRemoteConfiguration),
        workflowUpdates: asStringArray(execution.inputs?.setupWorkflowUpdates),
    };
}

function asObject<T>(value: unknown): T | undefined {
    return value && typeof value === 'object' ? value as T : undefined;
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
