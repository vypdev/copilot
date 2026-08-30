import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { AuthenticatedUserPort } from '../../../../../application/ports/authenticated_user_ports';
import type { Execution } from '../../../../../data/model/execution';
import { logDebugInfo, logError, logInfo } from '../../../../ports/logging_ports';
import { runCommitAndPushPreflight } from './commit_and_push_preflight';
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
    const preflight = await runCommitAndPushPreflight(execution, options, gitCommitPort);
    if (preflight.status === 'failure') {
        return { success: false, committed: false, error: preflight.error };
    }
    if (preflight.status === 'success') {
        logDebugInfo(options.noChangesMessage);
        return { success: true, committed: false };
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
