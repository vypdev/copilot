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

export interface InitialSetupWorkflowDependencies {
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
    param: Execution,
    dependencies: InitialSetupWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);
    const steps: string[] = [];
    const errors: string[] = [];

    try {
        logInfo('📋 Ensuring .github and copying setup files...');
        const filesResult = dependencies.setupWorkspacePort.prepare();
        steps.push(`✅ Setup files: ${filesResult.copied} copied, ${filesResult.skipped} already existed`);
        if (!dependencies.setupWorkspacePort.hasValidToken()) {
            logInfo('  🛑 Setup requires PERSONAL_ACCESS_TOKEN (environment or .env) with a valid token.');
            errors.push('PERSONAL_ACCESS_TOKEN must be set (environment or .env) with a valid token to run setup.');
            return [buildResult(errors, steps)];
        }

        logInfo('🔐 Checking GitHub access...');
        const githubAccess = await verifyGitHubAccess(param, dependencies.authenticatedUserPort);
        if (!githubAccess.success) {
            errors.push(...githubAccess.errors);
            return [buildResult(errors, steps)];
        }
        steps.push(`✅ GitHub access verified: ${githubAccess.user}`);

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

        const defaultVersion = await ensureDefaultVersion(param, dependencies);
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
): Promise<{ step?: string; error?: string }> {
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
