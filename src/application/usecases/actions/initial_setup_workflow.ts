import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { LatestTagQueryPort } from '../../ports/branch_tag_ports';
import type { AuthenticatedUserPort } from '../../ports/authenticated_user_ports';
import type { RepositoryTagPort, RepositoryDefaultBranchPort } from '../../ports/repository_release_ports';
import type {
    InitialLabelProvisioningPort,
    IssueTypeProvisioningPort,
    LabelProvisioningSummary,
} from '../../ports/issue_management_ports';
import type { SetupWorkspacePort } from '../../ports/setup_workspace_ports';
import { DEFAULT_INITIAL_TAG } from '../../../data/model/version_policy';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { getTaskEmoji } from '../../../utils/task_emoji';
import type { SetupConfiguration, SetupCredentialCollection, SetupRemoteConfiguration, SetupResourceTarget } from '../../../domain/setup';
import type {
    SetupRemoteConfigurationReadPort,
    SetupRepositorySecretsPort,
    SetupRepositoryVariablesPort,
} from '../../ports/setup_wizard_ports';
import {
    buildSetupRepositoryVariables,
    resolveSetupResourceTarget,
    shouldUpsertSetupResource,
    usesOrganizationStorage,
} from '../../policies/setup_configuration_policy';

export interface InitialSetupWorkflowDependencies {
    authenticatedUserPort: AuthenticatedUserPort;
    initialLabelProvisioningPort: InitialLabelProvisioningPort;
    issueTypeProvisioningPort: IssueTypeProvisioningPort;
    latestTagQueryPort: LatestTagQueryPort;
    repositoryDefaultBranchPort: RepositoryDefaultBranchPort;
    repositoryTagPort: RepositoryTagPort;
    setupWorkspacePort: SetupWorkspacePort;
    setupRepositoryVariablesPort?: SetupRepositoryVariablesPort;
    setupRepositorySecretsPort?: SetupRepositorySecretsPort;
    setupRemoteConfigurationReadPort?: SetupRemoteConfigurationReadPort;
}

type InitialLabelProvisioningOutcome =
    | { completed: true; configured: LabelProvisioningSummary; progress: LabelProvisioningSummary }
    | { completed: false; error: string };

const TASK_ID = 'InitialSetupUseCase';

/** Runs repository setup as an ordered application workflow with explicit port dependencies. */
export async function runInitialSetupWorkflow(
    param: Execution,
    dependencies: InitialSetupWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    const steps: string[] = [];
    const errors: string[] = [];

    try {
        const setupConfiguration = getSetupConfiguration(param);
        if (!dependencies.setupWorkspacePort.hasValidToken(param.tokens.token)) {
            logInfo('  🛑 Setup requires the setup PAT provided for this command with a valid token.');
            errors.push('A valid setup PAT must be provided to run setup. It is separate from the workflow PAT Secret.');
            return [buildResult(errors, steps)];
        }
        logInfo('📋 Ensuring .github and copying setup files...');
        const workflowUpdates = getWorkflowUpdates(param);
        const workspaceSelection = {
            features: setupConfiguration?.features,
            ...(workflowUpdates.length > 0 ? {
                updateExistingWorkflows: true,
                approvedWorkflowFiles: workflowUpdates,
            } : {}),
        };
        const filesResult = dependencies.setupWorkspacePort.prepare(workspaceSelection);
        steps.push(`✅ Setup files: ${filesResult.copied} copied, ${filesResult.skipped} already existed`);
        logInfo('🔐 Checking GitHub access...');
        const githubAccess = await verifyGitHubAccess(param, dependencies.authenticatedUserPort);
        if (!githubAccess.success) {
            errors.push(...githubAccess.errors);
            return [buildResult(errors, steps)];
        }
        steps.push(`✅ GitHub access verified: ${githubAccess.user}`);

        const remoteConfiguration = await resolveRemoteConfiguration(param, dependencies, setupConfiguration, errors);

        const secrets = await ensureRepositorySecrets(param, dependencies, setupConfiguration, remoteConfiguration);
        if (secrets.step) steps.push(secrets.step);
        if (secrets.errors.length > 0) errors.push(...secrets.errors);

        logInfo('🏷️  Checking configured and progress labels...');
        const labels = await ensureInitialLabels(param, dependencies.initialLabelProvisioningPort);
        if (!labels.completed) {
            errors.push(labels.error);
        } else {
            appendLabelSummary(steps, errors, labels.configured, 'Labels');
            appendLabelSummary(steps, errors, labels.progress, 'Progress labels');
        }

        logInfo('📋 Checking issue types...');
        const issueTypes = await ensureIssueTypes(param, dependencies.issueTypeProvisioningPort);
        if (!issueTypes.success) {
            errors.push(...issueTypes.errors);
        } else {
            steps.push(`✅ Issue types checked: ${issueTypes.created} created, ${issueTypes.existing} already existed`);
        }

        const variables = await ensureRepositoryVariables(param, dependencies, setupConfiguration, remoteConfiguration);
        if (variables.step) steps.push(variables.step);
        if (variables.errors.length > 0) errors.push(...variables.errors);

        const defaultVersion = await ensureDefaultVersion(param, dependencies, setupConfiguration);
        if (defaultVersion.step) steps.push(defaultVersion.step);
        if (defaultVersion.error) errors.push(defaultVersion.error);
        return [buildResult(errors, steps)];
    } catch (error) {
        logError(error);
        errors.push(`Error running initial setup: ${error}`);
        return [buildResult(errors, steps)];
    }
}

async function verifyGitHubAccess(
    param: Execution,
    repository: AuthenticatedUserPort,
): Promise<{ success: boolean; user?: string; errors: string[] }> {
    try {
        const user = await repository.getUserFromToken(param.tokens.token);
        return { success: true, user, errors: [] };
    } catch (error) {
        logError(`Error verifying GitHub access: ${error}`);
        return { success: false, errors: [`Could not verify GitHub access: ${error}`] };
    }
}

async function ensureInitialLabels(
    param: Execution,
    repository: InitialLabelProvisioningPort,
): Promise<InitialLabelProvisioningOutcome> {
    try {
        const summary = await repository.ensureInitialLabels(
            param.owner,
            param.repo,
            param.labels,
            param.tokens.token,
        );
        return { completed: true, ...summary };
    } catch (error) {
        const message = `Error ensuring initial labels: ${error}`;
        logError(message);
        return { completed: false, error: message };
    }
}

async function ensureIssueTypes(
    param: Execution,
    repository: IssueTypeProvisioningPort,
): Promise<{ success: boolean; created: number; existing: number; errors: string[] }> {
    try {
        const result = await repository.ensureIssueTypes(
            param.owner,
            param.issueTypes,
            param.tokens.token,
        );
        return {
            success: result.errors.length === 0,
            created: result.created,
            existing: result.existing,
            errors: result.errors,
        };
    } catch (error) {
        logError(`Error ensuring issue types: ${error}`);
        return { success: false, created: 0, existing: 0, errors: [`Error ensuring issue types: ${error}`] };
    }
}

async function ensureDefaultVersion(
    param: Execution,
    dependencies: InitialSetupWorkflowDependencies,
    setupConfiguration?: SetupConfiguration,
): Promise<{ step?: string; error?: string }> {
    if (setupConfiguration?.createInitialTag === false) {
        return { step: '⏭️  Initial version tag creation disabled by setup configuration.' };
    }
    try {
        const existingTag = await dependencies.latestTagQueryPort.getLatestTag();
        if (existingTag !== undefined) {
            logDebugInfo(`Repository already has version tags (latest: ${existingTag}). Skipping default tag.`);
            return {};
        }

        logInfo(`🏷️  No version tags found. Creating default tag ${DEFAULT_INITIAL_TAG}...`);
        const defaultBranch = await dependencies.repositoryDefaultBranchPort.getDefaultBranch(
            param.owner,
            param.repo,
            param.tokens.token,
        );
        if (!defaultBranch) {
            const message = 'Could not get default branch to create initial version tag.';
            logError(message);
            return { error: message };
        }

        const sha = await dependencies.repositoryTagPort.createTag(
            param.owner,
            param.repo,
            defaultBranch,
            DEFAULT_INITIAL_TAG,
            param.tokens.token,
        );
        return sha
            ? { step: `✅ Default version tag ${DEFAULT_INITIAL_TAG} created on branch ${defaultBranch}. Run \`git fetch --tags\` to update local refs.` }
            : { error: `Failed to create tag ${DEFAULT_INITIAL_TAG} on ${param.owner}/${param.repo}` };
    } catch (error) {
        const message = `Error ensuring default version: ${error}`;
        logError(message);
        return { error: message };
    }
}

function getSetupConfiguration(param: Execution): SetupConfiguration | undefined {
    const configuration = param.inputs?.setupConfiguration;
    return configuration && typeof configuration === 'object'
        ? configuration as SetupConfiguration
        : undefined;
}

function getWorkflowUpdates(param: Execution): string[] {
    const updates = param.inputs?.setupWorkflowUpdates;
    return Array.isArray(updates) ? updates.filter((file): file is string => typeof file === 'string') : [];
}

async function ensureRepositoryVariables(
    param: Execution,
    dependencies: InitialSetupWorkflowDependencies,
    setupConfiguration?: SetupConfiguration,
    remoteConfiguration?: SetupRemoteConfiguration,
): Promise<{ step?: string; errors: string[] }> {
    if (!setupConfiguration?.manageRepositoryVariables || !dependencies.setupRepositoryVariablesPort) {
        return { errors: [] };
    }
    try {
        const desired = buildSetupRepositoryVariables(setupConfiguration);
        const groups = groupResources(desired, 'variable', setupConfiguration, remoteConfiguration);
        const result = await upsertVariableGroups(param, dependencies.setupRepositoryVariablesPort, groups);
        if (result.errors.length > 0) return { errors: result.errors };
        return {
            step: `✅ GitHub Actions Variables: ${result.created} created, ${result.updated} updated; existing effective values preserved when no override was selected.`,
            errors: [],
        };
    } catch (error) {
        const message = `Error configuring repository Variables: ${error}`;
        logError(message);
        return { errors: [message] };
    }
}

async function ensureRepositorySecrets(
    param: Execution,
    dependencies: InitialSetupWorkflowDependencies,
    setupConfiguration?: SetupConfiguration,
    remoteConfiguration?: SetupRemoteConfiguration,
): Promise<{ step?: string; errors: string[] }> {
    if (!setupConfiguration?.manageRepositorySecrets || !dependencies.setupRepositorySecretsPort) {
        return { errors: [] };
    }
    const credentials = getSetupCredentialCollection(param);
    if (!credentials) {
        return { step: '⚠️  Repository Secrets were not changed: run interactive setup to validate and provide credentials.', errors: [] };
    }
    const values = [
        ...(credentials.workflowPat ? [credentials.workflowPat] : []),
        ...credentials.apiKeys,
    ];
    if (values.length === 0) return { step: '✅ Existing Repository Secrets kept unchanged.', errors: [] };
    try {
        const groups = groupResources(values, 'secret', setupConfiguration, remoteConfiguration);
        const result = await upsertSecretGroups(param, dependencies.setupRepositorySecretsPort, groups);
        if (result.errors.length > 0) return { errors: result.errors };
        return {
            step: `✅ GitHub Actions Secrets: ${result.created} created, ${result.updated} updated; existing effective values kept when no replacement was selected.`,
            errors: [],
        };
    } catch (error) {
        const message = `Error configuring repository Secrets: ${error}`;
        logError(message);
        return { errors: [message] };
    }
}

async function resolveRemoteConfiguration(
    param: Execution,
    dependencies: InitialSetupWorkflowDependencies,
    setupConfiguration: SetupConfiguration | undefined,
    errors: string[],
): Promise<SetupRemoteConfiguration | undefined> {
    const provided = param.inputs?.setupRemoteConfiguration;
    if (provided && typeof provided === 'object') return provided as SetupRemoteConfiguration;
    if (!dependencies.setupRemoteConfigurationReadPort || !setupConfiguration) return undefined;
    try {
        return await dependencies.setupRemoteConfigurationReadPort.inspect(param.owner, param.repo, param.tokens.token);
    } catch (error) {
        const message = `Could not inspect existing GitHub Actions resource scopes: ${error instanceof Error ? error.message : String(error)}`;
        logError(message);
        if (usesOrganizationStorage(setupConfiguration)) errors.push(message);
        return undefined;
    }
}

type SetupResource = { name: string; value: string };
type ResourceGroup = { target: SetupResourceTarget; resources: SetupResource[] };

function groupResources(
    resources: readonly SetupResource[],
    kind: 'secret' | 'variable',
    configuration: SetupConfiguration,
    remoteConfiguration?: SetupRemoteConfiguration,
): ResourceGroup[] {
    const groups = new Map<string, ResourceGroup>();
    for (const resource of resources) {
        // Secret values reach this workflow only after the user chose keep/replace.
        // Variables, however, are always generated from the selected setup contract,
        // so preserveExisting must be applied here to avoid shadowing inherited values.
        if (kind === 'variable' && !shouldUpsertSetupResource(configuration, kind, resource.name, remoteConfiguration)) continue;
        const target = resolveSetupResourceTarget(configuration, kind, resource.name, remoteConfiguration);
        const key = `${target.scope}:${target.organizationVisibility}:${target.repositoryId ?? ''}`;
        const group = groups.get(key) ?? { target, resources: [] };
        group.resources.push(resource);
        groups.set(key, group);
    }
    return [...groups.values()];
}

async function upsertVariableGroups(
    param: Execution,
    port: SetupRepositoryVariablesPort,
    groups: readonly ResourceGroup[],
): Promise<{ created: number; updated: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    for (const group of groups) {
        if (group.target.scope === 'organization' && !port.upsertScopedVariables) {
            errors.push('Organization Variable provisioning is not available in this installation.');
            continue;
        }
        const result = group.target.scope === 'organization'
            ? await port.upsertScopedVariables!(param.owner, param.repo, param.tokens.token, group.target, group.resources)
            : await port.upsert(param.owner, param.repo, param.tokens.token, group.resources);
        created += result.created;
        updated += result.updated;
        errors.push(...result.errors);
    }
    return { created, updated, errors };
}

async function upsertSecretGroups(
    param: Execution,
    port: SetupRepositorySecretsPort,
    groups: readonly ResourceGroup[],
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const group of groups) {
        if (group.target.scope === 'organization' && !port.upsertScopedSecrets) {
            errors.push('Organization Secret provisioning is not available in this installation.');
            continue;
        }
        const result = group.target.scope === 'organization'
            ? await port.upsertScopedSecrets!(param.owner, param.repo, param.tokens.token, group.target, group.resources)
            : await port.upsertSecrets(param.owner, param.repo, param.tokens.token, group.resources);
        created += result.created;
        updated += result.updated;
        skipped += result.skipped;
        errors.push(...result.errors);
    }
    return { created, updated, skipped, errors };
}

function getSetupCredentialCollection(param: Execution): SetupCredentialCollection | undefined {
    const credentials = param.inputs?.setupCredentials;
    if (!credentials || typeof credentials !== 'object') return undefined;
    return credentials as SetupCredentialCollection;
}

function appendLabelSummary(
    steps: string[],
    errors: string[],
    summary: LabelProvisioningSummary,
    labelType: string,
): void {
    if (summary.errors.length > 0) {
        errors.push(...summary.errors);
        logError(`Error checking labels: ${summary.errors}`);
    } else {
        steps.push(`✅ ${labelType} checked: ${summary.created} created, ${summary.existing} already existed`);
    }
}

function buildResult(errors: string[], steps: string[]): Result {
    return new Result({
        id: TASK_ID,
        success: errors.length === 0,
        executed: true,
        steps,
        errors: errors.length > 0 ? errors : undefined,
    });
}
