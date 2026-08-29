import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { AuthenticatedUserPort } from '../../../../../application/ports/authenticated_user_ports';
import type { Execution } from '../../../../../data/model/execution';
import { logDebugInfo, logError, logInfo } from '../../../../ports/logging_ports';
import { checkoutBranch } from './git_branch_checkout';
import { MAX_VERIFY_COMMANDS, limitVerifyCommands } from './verify_command_policy';
import { runVerifyCommands } from './verify_command_runner';
import { hasWorkspaceChanges } from './workspace_changes';
export interface CommitAndPushWorkflowResult {
    success: boolean;
    committed: boolean;
    error?: string;
}

export interface CommitAndPushWorkflowOptions {
    branch: string;
    commitMessage: string;
    branchOverride?: boolean;
    workspacePaths?: string[];
    noChangesMessage: string;
}

export async function runCommitAndPushWorkflow(
    execution: Execution,
    options: CommitAndPushWorkflowOptions,
    authenticatedUserPort: AuthenticatedUserPort,
    gitCommitPort: GitCommitPort,
): Promise<CommitAndPushWorkflowResult> {
    if (!options.branch?.trim()) {
        return { success: false, committed: false, error: 'No branch to commit to.' };
    }

    if (options.branchOverride && !(await checkoutBranch(options.branch, gitCommitPort))) {
        return {
            success: false,
            committed: false,
            error: `Failed to checkout branch ${options.branch}.`,
        };
    }

    const configured = execution.ai?.getBugbotFixVerifyCommands?.() ?? [];
    const verifyCommands = limitVerifyCommands(Array.isArray(configured) ? configured : []);
    if (Array.isArray(configured) && configured.length > MAX_VERIFY_COMMANDS) {
        logInfo(`Limiting verify commands to ${MAX_VERIFY_COMMANDS} (configured: ${configured.length}).`);
    }
    if (verifyCommands.length > 0) {
        logInfo(`Running ${verifyCommands.length} verify command(s)...`);
        const verify = await runVerifyCommands(verifyCommands, (program, args) => gitCommitPort.execute(program, args));
        if (!verify.success) {
            return {
                success: false,
                committed: false,
                error: verify.error ?? `Verify command failed: ${verify.failedCommand ?? 'unknown'}.`,
            };
        }
    }

    if (!(await hasWorkspaceChanges(gitCommitPort))) {
        logDebugInfo(options.noChangesMessage);
        return { success: true, committed: false };
    }

    if (options.workspacePaths && options.workspacePaths.length === 0) {
        return { success: false, committed: false, error: 'No safe workspace paths to commit.' };
    }

    try {
        const { name, email } = await authenticatedUserPort.getTokenUserDetails(execution.tokens.token);
        await gitCommitPort.configureAuthor(name, email);
        logDebugInfo(`Git author set to ${name} <${email}>.`);
        if (options.workspacePaths) {
            await gitCommitPort.stagePaths(options.workspacePaths);
        } else {
            await gitCommitPort.stageAll();
        }
        await gitCommitPort.commit(options.commitMessage);
        await gitCommitPort.push(options.branch);
        logInfo(`Pushed commit to origin/${options.branch}.`);
        return { success: true, committed: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`Commit or push failed: ${message}`);
        return { success: false, committed: false, error: message };
    }
}
