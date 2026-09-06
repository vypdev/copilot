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
import type { SetupConfiguration } from '../../../domain/setup';
import type { SetupResourceProvisioningDependencies } from './setup_resource_provisioning';
import type { InitialSetupRequest } from './initial_setup_request';
import {
    ensureRepositorySecrets,
    ensureRepositoryVariables,
    resolveRemoteConfiguration,
} from './setup_resource_provisioning';

export interface InitialSetupWorkflowDependencies extends SetupResourceProvisioningDependencies {
    authenticatedUserPort: AuthenticatedUserPort;
    initialLabelProvisioningPort: InitialLabelProvisioningPort;
    issueTypeProvisioningPort: IssueTypeProvisioningPort;
    latestTagQueryPort: LatestTagQueryPort;
    repositoryDefaultBranchPort: RepositoryDefaultBranchPort;
    repositoryTagPort: RepositoryTagPort;
    setupWorkspacePort: SetupWorkspacePort;
}

type InitialLabelProvisioningOutcome =
    | { completed: true; configured: LabelProvisioningSummary; progress: LabelProvisioningSummary }
    | { completed: false; error: string };

const TASK_ID = 'InitialSetupUseCase';

/** Runs repository setup as an ordered application workflow with explicit port dependencies. */
export async function runInitialSetupWorkflow(
    request: InitialSetupRequest,
    dependencies: InitialSetupWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    const steps: string[] = [];
    const errors: string[] = [];

    try {
        const setupConfiguration = request.setupConfiguration;
        if (!dependencies.setupWorkspacePort.hasValidToken(request.token)) {
            logInfo('  🛑 Setup requires the setup PAT provided for this command with a valid token.');
            errors.push('A valid setup PAT must be provided to run setup. It is separate from the workflow PAT Secret.');
            return [buildResult(errors, steps)];
        }
        logInfo('📋 Ensuring .github and copying setup files...');
        const workspaceSelection = {
            features: setupConfiguration?.features,
            ...(request.workflowUpdates.length > 0 ? {
                updateExistingWorkflows: true,
                approvedWorkflowFiles: request.workflowUpdates,
            } : {}),
        };
        const filesResult = dependencies.setupWorkspacePort.prepare(workspaceSelection);
        steps.push(`✅ Setup files: ${filesResult.copied} copied, ${filesResult.skipped} already existed`);
        logInfo('🔐 Checking GitHub access...');
        const githubAccess = await verifyGitHubAccess(request, dependencies.authenticatedUserPort);
        if (!githubAccess.success) {
            errors.push(...githubAccess.errors);
            return [buildResult(errors, steps)];
        }
        steps.push(`✅ GitHub access verified: ${githubAccess.user}`);

        const remoteConfiguration = await resolveRemoteConfiguration(request, dependencies, setupConfiguration, errors);

        const secrets = await ensureRepositorySecrets(request, dependencies, setupConfiguration, remoteConfiguration);
        if (secrets.step) steps.push(secrets.step);
        if (secrets.errors.length > 0) errors.push(...secrets.errors);

        logInfo('🏷️  Checking configured and progress labels...');
        const labels = await ensureInitialLabels(request, dependencies.initialLabelProvisioningPort);
        if (!labels.completed) {
            errors.push(labels.error);
        } else {
            appendLabelSummary(steps, errors, labels.configured, 'Labels');
            appendLabelSummary(steps, errors, labels.progress, 'Progress labels');
        }

        logInfo('📋 Checking issue types...');
        const issueTypes = await ensureIssueTypes(request, dependencies.issueTypeProvisioningPort);
        if (!issueTypes.success) {
            errors.push(...issueTypes.errors);
        } else {
            steps.push(`✅ Issue types checked: ${issueTypes.created} created, ${issueTypes.existing} already existed`);
        }

        const variables = await ensureRepositoryVariables(request, dependencies, setupConfiguration, remoteConfiguration);
        if (variables.step) steps.push(variables.step);
        if (variables.errors.length > 0) errors.push(...variables.errors);

        const defaultVersion = await ensureDefaultVersion(request, dependencies, setupConfiguration);
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
    request: InitialSetupRequest,
    repository: AuthenticatedUserPort,
): Promise<{ success: boolean; user?: string; errors: string[] }> {
    try {
        const user = await repository.getUserFromToken(request.token);
        return { success: true, user, errors: [] };
    } catch (error) {
        logError(`Error verifying GitHub access: ${error}`);
        return { success: false, errors: [`Could not verify GitHub access: ${error}`] };
    }
}

async function ensureInitialLabels(
    request: InitialSetupRequest,
    repository: InitialLabelProvisioningPort,
): Promise<InitialLabelProvisioningOutcome> {
    try {
        const summary = await repository.ensureInitialLabels(
            request.owner,
            request.repo,
            request.labels,
            request.token,
        );
        return { completed: true, ...summary };
    } catch (error) {
        const message = `Error ensuring initial labels: ${error}`;
        logError(message);
        return { completed: false, error: message };
    }
}

async function ensureIssueTypes(
    request: InitialSetupRequest,
    repository: IssueTypeProvisioningPort,
): Promise<{ success: boolean; created: number; existing: number; errors: string[] }> {
    try {
        const result = await repository.ensureIssueTypes(
            request.owner,
            request.issueTypes,
            request.token,
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
    request: InitialSetupRequest,
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
            request.owner,
            request.repo,
            request.token,
        );
        if (!defaultBranch) {
            const message = 'Could not get default branch to create initial version tag.';
            logError(message);
            return { error: message };
        }

        const sha = await dependencies.repositoryTagPort.createTag(
            request.owner,
            request.repo,
            defaultBranch,
            DEFAULT_INITIAL_TAG,
            request.token,
        );
        return sha
            ? { step: `✅ Default version tag ${DEFAULT_INITIAL_TAG} created on branch ${defaultBranch}. Run \`git fetch --tags\` to update local refs.` }
            : { error: `Failed to create tag ${DEFAULT_INITIAL_TAG} on ${request.owner}/${request.repo}` };
    } catch (error) {
        const message = `Error ensuring default version: ${error}`;
        logError(message);
        return { error: message };
    }
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
