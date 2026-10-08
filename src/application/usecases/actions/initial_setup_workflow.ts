import { Result } from '../../../data/model/result';
import type { LatestTagQueryPort } from '../../ports/branch_tag_ports';
import type { BoundAuthenticatedUserPort } from '../../ports/authenticated_user_ports';
import type { BoundRepositoryTagPort, BoundRepositoryDefaultBranchPort } from '../../ports/repository_release_ports';
import type {
    BoundInitialLabelProvisioningPort,
    BoundIssueTypeProvisioningPort,
    LabelProvisioningSummary,
} from '../../ports/issue_management_ports';
import type { BoundSetupWorkspacePort } from '../../ports/setup_workspace_ports';
import { DEFAULT_INITIAL_TAG } from '../../../data/model/version_policy';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { getTaskEmoji } from '../../../utils/task_emoji';
import type { SetupConfiguration, SetupOperationEffect, SetupVariableWriteFailure } from '../../../domain/setup';
import type { SetupResourceProvisioningDependencies } from './setup_resource_provisioning';
import type { InitialSetupContext } from '../push_single_action_contexts';
import {
    SECRET_PROVISIONING_UNAVAILABLE,
    VARIABLE_PROVISIONING_UNAVAILABLE,
    ensureRepositorySecrets,
    ensureRepositoryVariables,
    resolveRemoteConfiguration,
} from './setup_resource_provisioning';
import { ApplicationError, type ApplicationErrorCode, toApplicationError } from '../../errors/application_error';
import { setupNeedsInitialVersion } from '../../policies/setup_issue_workflow_policy';
import { selectedInitialIssueTypes, selectedInitialLabels } from '../../policies/setup_issue_resource_policy';
import {
    buildSetupCredentialRequirements,
    buildSetupRepositoryVariables,
    validateSetupManagedResourceInventory,
    validateSetupStorageAgainstRemote,
} from '../../policies/setup_configuration_policy';

export interface InitialSetupWorkflowDependencies extends SetupResourceProvisioningDependencies {
    progress?: (effect: SetupOperationEffect) => void;
    authenticatedUserPort: BoundAuthenticatedUserPort;
    initialLabelProvisioningPort: BoundInitialLabelProvisioningPort;
    issueTypeProvisioningPort: BoundIssueTypeProvisioningPort;
    latestTagQueryPort: LatestTagQueryPort;
    repositoryDefaultBranchPort: BoundRepositoryDefaultBranchPort;
    repositoryTagPort: BoundRepositoryTagPort;
    setupWorkspacePort: BoundSetupWorkspacePort;
}

type InitialLabelProvisioningOutcome =
    | { completed: true; configured: LabelProvisioningSummary; progress: LabelProvisioningSummary }
    | { completed: false; error: ApplicationError };

const TASK_ID = 'InitialSetupUseCase';

/** Runs repository setup as an ordered application workflow with explicit port dependencies. */
export async function runInitialSetupWorkflow(
    request: InitialSetupContext,
    dependencies: InitialSetupWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    const steps: string[] = [];
    const errors: ApplicationError[] = [];
    const configuration = request.setupConfiguration;
    const effects: SetupOperationEffect[] = [
        { id: 'files', state: 'not-started', scope: 'local' },
        { id: 'secrets', state: 'not-started', scope: resourceScope(configuration, 'secrets') },
        { id: 'labels', state: 'not-started', scope: 'repository' },
        { id: 'issue-types', state: 'not-started', scope: 'repository' },
        { id: 'variables', state: 'not-started', scope: resourceScope(configuration, 'variables') },
        { id: 'initial-tag', state: 'not-started', scope: 'repository' },
    ];
    const mark = (id: SetupOperationEffect['id'], state: SetupOperationEffect['state']) => {
        const index = effects.findIndex(effect => effect.id === id);
        effects[index] = { ...effects[index], state };
        try { dependencies.progress?.(Object.freeze({ ...effects[index] })); }
        catch { /* Presentation observers cannot abort provisioning. */ }
    };
    const receipt = () => buildResult(errors, steps, effects.map(effect => effect.state === 'in-progress'
        ? { ...effect, state: 'needs-inspection' } : effect));

    try {
        const setupConfiguration = request.setupConfiguration;
        if (!dependencies.setupWorkspacePort.hasValidToken()) {
            logInfo('  🛑 Setup requires the setup PAT provided for this command with a valid token.');
            errors.push(new ApplicationError('authorization.credential-invalid', 'A valid setup PAT must be provided to run setup. It is separate from the workflow PAT Secret.'));
            return [receipt()];
        }
        logInfo('🔐 Checking GitHub access...');
        const githubAccess = await verifyGitHubAccess(request, dependencies.authenticatedUserPort);
        if (!githubAccess.success) {
            errors.push(...githubAccess.errors);
            return [receipt()];
        }
        steps.push(`✅ GitHub access verified: ${githubAccess.user}`);

        const secretValues = Number(Boolean(request.setupCredentials?.workflowPat)) + (request.setupCredentials?.apiKeys.length ?? 0);
        const missingProvisioningPorts: ApplicationError[] = [];
        if (setupConfiguration?.manageRepositorySecrets && secretValues > 0 && !dependencies.setupRepositorySecretsPort) {
            missingProvisioningPorts.push(new ApplicationError('provider.unavailable', SECRET_PROVISIONING_UNAVAILABLE));
        }
        if (setupConfiguration?.manageRepositoryVariables && !dependencies.setupRepositoryVariablesPort) {
            missingProvisioningPorts.push(new ApplicationError('provider.unavailable', VARIABLE_PROVISIONING_UNAVAILABLE));
        }
        if (missingProvisioningPorts.length > 0) {
            errors.push(...missingProvisioningPorts);
            return [receipt()];
        }

        const remoteConfigurationErrors: string[] = [];
        const remoteConfiguration = await resolveRemoteConfiguration(
            request,
            dependencies,
            setupConfiguration,
            remoteConfigurationErrors,
        );
        errors.push(...fromMessages(remoteConfigurationErrors, 'provider.unavailable'));
        if (setupConfiguration && (setupConfiguration.manageRepositorySecrets || setupConfiguration.manageRepositoryVariables)) {
            if (!remoteConfiguration) {
                if (remoteConfigurationErrors.length === 0) {
                    errors.push(new ApplicationError('provider.unavailable', 'Could not inspect existing GitHub Actions resource scopes. Restore inventory access and rerun setup.'));
                }
                return [receipt()];
            }
            const inventoryErrors = [
                ...validateSetupStorageAgainstRemote(setupConfiguration, remoteConfiguration),
                ...validateSetupManagedResourceInventory(setupConfiguration, remoteConfiguration, {
                    secrets: buildSetupCredentialRequirements(setupConfiguration).map(requirement => requirement.name),
                    variables: buildSetupRepositoryVariables(setupConfiguration).map(variable => variable.name),
                }),
            ];
            if (inventoryErrors.length > 0) {
                errors.push(...fromMessages(inventoryErrors, 'provider.unavailable'));
                return [receipt()];
            }
        }

        logInfo('📋 Ensuring .github and copying setup files...');
        const workspaceSelection = {
            features: setupConfiguration?.features,
            setupConfiguration,
            ...(request.workflowUpdates.length > 0 ? {
                updateExistingWorkflows: true,
                approvedWorkflowFiles: request.workflowUpdates,
            } : {}),
        };
        mark('files', 'in-progress');
        const filesResult = dependencies.setupWorkspacePort.prepare(workspaceSelection);
        mark('files', filesResult.copied > 0 ? 'completed' : 'skipped');
        steps.push(`✅ Setup files: ${filesResult.copied} copied, ${filesResult.skipped} already existed`);

        if (setupConfiguration?.manageRepositorySecrets && secretValues > 0) mark('secrets', 'in-progress');
        const secrets = await ensureRepositorySecrets(request, dependencies, setupConfiguration, remoteConfiguration);
        mark('secrets', secrets.errors.length ? 'needs-inspection' : secrets.writes > 0 ? 'completed' : 'skipped');
        if (secrets.step) steps.push(secrets.step);
        if (secrets.errors.length > 0) errors.push(...fromMessages(secrets.errors, 'authorization.credential-invalid'));

        logInfo('🏷️  Checking configured and progress labels...');
        mark('labels', 'in-progress');
        const labels = await ensureInitialLabels(request, dependencies.initialLabelProvisioningPort, setupConfiguration);
        mark('labels', !labels.completed || labels.configured.errors.length || labels.progress.errors.length
            ? 'needs-inspection' : labels.configured.created + labels.progress.created > 0 ? 'completed' : 'skipped');
        if (!labels.completed) {
            errors.push(labels.error);
        } else {
            appendLabelSummary(steps, errors, labels.configured, 'Labels');
            appendLabelSummary(steps, errors, labels.progress, 'Progress labels');
        }

        logInfo('📋 Checking issue types...');
        mark('issue-types', 'in-progress');
        const issueTypes = await ensureIssueTypes(request, dependencies.issueTypeProvisioningPort, setupConfiguration);
        mark('issue-types', !issueTypes.success ? 'needs-inspection' : issueTypes.created > 0 ? 'completed' : 'skipped');
        if (!issueTypes.success) {
            errors.push(...fromMessages(issueTypes.errors, 'provider.unavailable'));
        } else {
            steps.push(`✅ Issue types checked: ${issueTypes.created} created, ${issueTypes.existing} already existed`);
        }

        if (setupConfiguration?.manageRepositoryVariables) mark('variables', 'in-progress');
        const variables = await ensureRepositoryVariables(request, dependencies, setupConfiguration, remoteConfiguration);
        mark('variables', variables.errors.length ? 'needs-inspection' : variables.writes > 0 ? 'completed' : 'skipped');
        if (variables.step) steps.push(variables.step);
        if (variables.errors.length > 0) {
            const variableErrors = variables.failures?.length
                ? [...variables.failures.map(variableFailureError), ...fromMessages(variables.unclassifiedErrors, 'provider.unavailable')]
                : fromMessages(variables.errors, 'provider.unavailable');
            variableErrors.forEach(error => logError(error.message));
            errors.push(...variableErrors);
        }

        if (!setupConfiguration || setupNeedsInitialVersion(setupConfiguration)) mark('initial-tag', 'in-progress');
        const defaultVersion = await ensureDefaultVersion(request, dependencies, setupConfiguration);
        mark('initial-tag', defaultVersion.error ? 'needs-inspection'
            : defaultVersion.step?.includes('created on branch') ? 'completed' : 'skipped');
        if (defaultVersion.step) steps.push(defaultVersion.step);
        if (defaultVersion.error) errors.push(defaultVersion.error);
        return [receipt()];
    } catch (error) {
        const semanticError = toApplicationError(error, 'workflow.failed', 'Error running initial setup.');
        logError(semanticError);
        errors.push(semanticError);
        return [receipt()];
    }
}

async function verifyGitHubAccess(
    _request: InitialSetupContext,
    repository: BoundAuthenticatedUserPort,
): Promise<{ success: boolean; user?: string; errors: ApplicationError[] }> {
    try {
        const user = await repository.getUser();
        return { success: true, user, errors: [] };
    } catch (error) {
        const semanticError = toApplicationError(error, 'authorization.credential-invalid', 'Could not verify GitHub access.');
        logError(semanticError);
        return { success: false, errors: [semanticError] };
    }
}

async function ensureInitialLabels(
    request: InitialSetupContext,
    repository: BoundInitialLabelProvisioningPort,
    setupConfiguration?: Readonly<SetupConfiguration>,
): Promise<InitialLabelProvisioningOutcome> {
    try {
        const summary = await repository.ensureInitialLabels(
            selectedInitialLabels(request.labels, setupConfiguration),
        );
        return { completed: true, ...summary };
    } catch (error) {
        const message = 'Could not ensure the initial labels.';
        logError(message);
        return { completed: false, error: toApplicationError(error, 'provider.unavailable', message) };
    }
}

async function ensureIssueTypes(
    request: InitialSetupContext,
    repository: BoundIssueTypeProvisioningPort,
    setupConfiguration?: Readonly<SetupConfiguration>,
): Promise<{ success: boolean; created: number; existing: number; errors: string[] }> {
    try {
        const result = await repository.ensureIssueTypes(
            selectedInitialIssueTypes(request.issueTypes, setupConfiguration),
        );
        return {
            success: result.errors.length === 0,
            created: result.created,
            existing: result.existing,
            errors: result.errors,
        };
    } catch (error) {
        const semanticError = toApplicationError(error, 'provider.unavailable', 'Could not ensure issue types.');
        logError(semanticError);
        return { success: false, created: 0, existing: 0, errors: [semanticError.message] };
    }
}

async function ensureDefaultVersion(
    _request: InitialSetupContext,
    dependencies: InitialSetupWorkflowDependencies,
    setupConfiguration?: SetupConfiguration,
): Promise<{ step?: string; error?: ApplicationError }> {
    if (setupConfiguration && !setupNeedsInitialVersion(setupConfiguration)) {
        return { step: '⏭️  Initial version tag is not needed by the selected issue workflows.' };
    }
    try {
        const existingTag = await dependencies.latestTagQueryPort.getLatestTag();
        if (existingTag !== undefined) {
            logDebugInfo(`Repository already has version tags (latest: ${existingTag}). Skipping default tag.`);
            return {};
        }

        logInfo(`🏷️  No version tags found. Creating default tag ${DEFAULT_INITIAL_TAG}...`);
        const defaultBranch = await dependencies.repositoryDefaultBranchPort.getDefaultBranch();
        if (!defaultBranch) {
            const message = 'Could not get default branch to create initial version tag.';
            logError(message);
            return { error: new ApplicationError('provider.contract-invalid', message) };
        }

        const sha = await dependencies.repositoryTagPort.createTag(
            defaultBranch,
            DEFAULT_INITIAL_TAG,
        );
        return sha
            ? { step: `✅ Default version tag ${DEFAULT_INITIAL_TAG} created on branch ${defaultBranch}. Run \`git fetch --tags\` to update local refs.` }
            : { error: new ApplicationError('provider.contract-invalid', `Failed to create tag ${DEFAULT_INITIAL_TAG}.`) };
    } catch (error) {
        const message = 'Error ensuring default version.';
        logError(message);
        return { error: toApplicationError(error, 'provider.unavailable', message) };
    }
}

function appendLabelSummary(
    steps: string[],
    errors: ApplicationError[],
    summary: LabelProvisioningSummary,
    labelType: string,
): void {
    if (summary.errors.length > 0) {
        errors.push(...fromMessages(summary.errors, 'provider.unavailable'));
        logError(`Error checking labels: ${summary.errors}`);
    } else {
        steps.push(`✅ ${labelType} checked: ${summary.created} created, ${summary.existing} already existed`);
    }
}

function buildResult(errors: ApplicationError[], steps: string[], effects: readonly SetupOperationEffect[]): Result {
    return new Result({
        id: TASK_ID,
        success: errors.length === 0,
        executed: true,
        steps,
        payload: { setupReceipt: { version: 1, effects: effects.map(effect => ({ ...effect })) } },
        errors: errors.length > 0 ? errors : undefined,
    });
}

function resourceScope(configuration: SetupConfiguration | undefined, kind: 'secrets' | 'variables'): SetupOperationEffect['scope'] {
    const policy = configuration?.storage[kind];
    if (!policy) return 'repository';
    return Object.values(policy.overrides).some(scope => scope !== policy.defaultScope) ? 'mixed' : policy.defaultScope;
}

function fromMessages(messages: readonly string[], code: ApplicationErrorCode): ApplicationError[] {
    return messages.map(message => new ApplicationError(code, message));
}

function variableFailureError(failure: SetupVariableWriteFailure): ApplicationError {
    const details = {
        authorization: ['authorization.denied', 'GitHub denied access; check Variables Write for this scope and repository authorization'],
        'invalid-input': ['validation.invalid-input', 'GitHub rejected the request; check the Variable name, value limits and visibility'],
        conflict: ['provider.conflict', 'GitHub reported a conflict; inspect the existing Variable before retrying'],
        'rate-limited': ['provider.rate-limited', 'GitHub rate limited the request; retry after the limit resets'],
        unavailable: ['provider.unavailable', 'GitHub did not complete the request'],
    } as const;
    const [code, message] = details[failure.reason];
    return new ApplicationError(code, `Unable to configure ${failure.scope} Variable ${failure.name} during ${failure.phase}: ${message}.`);
}
