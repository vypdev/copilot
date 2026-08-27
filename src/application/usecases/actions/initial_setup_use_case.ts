import { Execution } from "../../../data/model/execution";
import type { LatestTagQueryPort } from "../../ports/branch_tag_ports";
import type { AuthenticatedUserPort } from "../../ports/authenticated_user_ports";
import type { RepositoryTagPort, RepositoryDefaultBranchPort } from "../../ports/repository_release_ports";
import type { InitialLabelProvisioningPort, IssueTypeProvisioningPort, LabelProvisioningSummary } from "../../ports/issue_management_ports";
import type { SetupWorkspacePort } from "../../ports/setup_workspace_ports";
import { Result } from "../../../data/model/result";
import { ParamUseCase } from "../base/param_usecase";
import { DEFAULT_INITIAL_TAG } from "../../../utils/version_utils";
import { logDebugInfo, logError, logInfo } from "../../../utils/logger";
import { getTaskEmoji } from "../../../utils/task_emoji";

type InitialLabelProvisioningOutcome =
    | {
        completed: true;
        configured: LabelProvisioningSummary;
        progress: LabelProvisioningSummary;
    }
    | {
        completed: false;
        error: string;
    };

export class InitialSetupUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'InitialSetupUseCase';

    constructor(
        private readonly authenticatedUserPort: AuthenticatedUserPort,
        private readonly initialLabelProvisioningPort: InitialLabelProvisioningPort,
        private readonly issueTypeProvisioningPort: IssueTypeProvisioningPort,
        private readonly latestTagQueryPort: LatestTagQueryPort,
        private readonly repositoryDefaultBranchPort: RepositoryDefaultBranchPort,
        private readonly repositoryTagPort: RepositoryTagPort,
        private readonly setupWorkspacePort: SetupWorkspacePort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const results: Result[] = [];
        const steps: string[] = [];
        const errors: string[] = [];

        try {
            // 0. Setup files (.github/workflows, .github/ISSUE_TEMPLATE, and pull_request_template.md)
            logInfo('📋 Ensuring .github and copying setup files...');
            const filesResult = this.setupWorkspacePort.prepare();
            steps.push(`✅ Setup files: ${filesResult.copied} copied, ${filesResult.skipped} already existed`);

            if (!this.setupWorkspacePort.hasValidToken()) {
                logInfo('  🛑 Setup requires PERSONAL_ACCESS_TOKEN (environment or .env) with a valid token.');
                errors.push('PERSONAL_ACCESS_TOKEN must be set (environment or .env) with a valid token to run setup.');
                results.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: steps,
                        errors: errors,
                    })
                );
                return results;
            }

            // 1. Verify GitHub access with Personal Access Token
            logInfo('🔐 Checking GitHub access...');
            const githubAccessResult = await this.verifyGitHubAccess(param);
            if (!githubAccessResult.success) {
                errors.push(...githubAccessResult.errors);
                results.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: steps,
                        errors: errors,
                    })
                );
                return results;
            }
            steps.push(`✅ GitHub access verified: ${githubAccessResult.user}`);

            // 2. Provision the complete initial label catalog in one semantic execution
            logInfo('🏷️  Checking configured and progress labels...');
            const initialLabelsResult = await this.ensureInitialLabels(param);
            if (!initialLabelsResult.completed) {
                errors.push(initialLabelsResult.error);
            } else {
                const labelsResult = initialLabelsResult.configured;
                if (labelsResult.errors.length > 0) {
                    errors.push(...labelsResult.errors);
                    logError(`Error checking labels: ${labelsResult.errors}`);
                } else {
                    steps.push(`✅ Labels checked: ${labelsResult.created} created, ${labelsResult.existing} already existed`);
                }

                // Report progress labels (0%, 5%, ..., 100%) separately in the user-facing result
                const progressLabelsResult = initialLabelsResult.progress;
                if (progressLabelsResult.errors.length > 0) {
                    errors.push(...progressLabelsResult.errors);
                    logError(`Error checking progress labels: ${progressLabelsResult.errors}`);
                } else {
                    steps.push(`✅ Progress labels checked: ${progressLabelsResult.created} created, ${progressLabelsResult.existing} already existed`);
                }
            }

            // 3. Create all issue types if they do not exist
            logInfo('📋 Checking issue types...');
            const issueTypesResult = await this.ensureIssueTypes(param);
            if (!issueTypesResult.success) {
                errors.push(...issueTypesResult.errors);
            } else {
                steps.push(`✅ Issue types checked: ${issueTypesResult.created} created, ${issueTypesResult.existing} already existed`);
            }

            // 4. If repo has no tags, create default version v1.0.0
            const defaultVersionResult = await this.ensureDefaultVersion(param);
            if (defaultVersionResult.step) {
                steps.push(defaultVersionResult.step);
            }
            if (defaultVersionResult.error) {
                errors.push(defaultVersionResult.error);
            }

            results.push(
                new Result({
                    id: this.taskId,
                    success: errors.length === 0,
                    executed: true,
                    steps: steps,
                    errors: errors.length > 0 ? errors : undefined,
                })
            );
        } catch (error) {
            logError(error);
            errors.push(`Error running initial setup: ${error}`);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: steps,
                    errors: errors,
                })
            );
        }

        return results;
    }

    private async verifyGitHubAccess(param: Execution): Promise<{ success: boolean; user?: string; errors: string[] }> {
        const errors: string[] = [];
        try {
            const user = await this.authenticatedUserPort.getUserFromToken(param.tokens.token);
            return { success: true, user, errors: [] };
        } catch (error) {
            logError(`Error verifying GitHub access: ${error}`);
            errors.push(`Could not verify GitHub access: ${error}`);
            return { success: false, errors };
        }
    }

    private async ensureInitialLabels(param: Execution): Promise<InitialLabelProvisioningOutcome> {
        try {
            const summary = await this.initialLabelProvisioningPort.ensureInitialLabels(
                param.owner,
                param.repo,
                param.labels,
                param.tokens.token
            );
            return { completed: true, ...summary };
        } catch (error) {
            const message = `Error ensuring initial labels: ${error}`;
            logError(message);
            return { completed: false, error: message };
        }
    }

    private async ensureIssueTypes(param: Execution): Promise<{ success: boolean; created: number; existing: number; errors: string[] }> {
        try {
            const result = await this.issueTypeProvisioningPort.ensureIssueTypes(
                param.owner,
                param.issueTypes,
                param.tokens.token
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

    /**
     * If the repository has no version tags, create default tag v1.0.0 on the default branch.
     * Used by "copilot setup" so release/hotfix issues get a base version.
     */
    private async ensureDefaultVersion(param: Execution): Promise<{ step?: string; error?: string }> {
        try {
            const existingTag = await this.latestTagQueryPort.getLatestTag();
            if (existingTag !== undefined) {
                logDebugInfo(`Repository already has version tags (latest: ${existingTag}). Skipping default tag.`);
                return {};
            }

            logInfo(`🏷️  No version tags found. Creating default tag ${DEFAULT_INITIAL_TAG}...`);
            const defaultBranch = await this.repositoryDefaultBranchPort.getDefaultBranch(param.owner, param.repo, param.tokens.token);
            if (!defaultBranch) {
                const msg = 'Could not get default branch to create initial version tag.';
                logError(msg);
                return { error: msg };
            }

            const sha = await this.repositoryTagPort.createTag(
                param.owner,
                param.repo,
                defaultBranch,
                DEFAULT_INITIAL_TAG,
                param.tokens.token,
            );
            if (sha) {
                const step = `✅ Default version tag ${DEFAULT_INITIAL_TAG} created on branch ${defaultBranch}. Run \`git fetch --tags\` to update local refs.`;
                return { step };
            }
            return { error: `Failed to create tag ${DEFAULT_INITIAL_TAG} on ${param.owner}/${param.repo}` };
        } catch (error) {
            const msg = `Error ensuring default version: ${error}`;
            logError(msg);
            return { error: msg };
        }
    }

}
