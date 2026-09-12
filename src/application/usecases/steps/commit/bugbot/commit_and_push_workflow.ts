import type { BugbotGitMutationPort } from '../../../../../application/ports/bugbot_git_ports';
import { logDebugInfo, logError, logInfo } from '../../../../ports/logging_ports';
import { runCommitAndPushPreflight } from './commit_and_push_preflight';
import { toApplicationError } from '../../../../errors/application_error';
import type { BugbotCommitContext } from './bugbot_review_operation_context';
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
    context: BugbotCommitContext,
    options: CommitAndPushWorkflowOptions,
    gitCommitPort: BugbotGitMutationPort,
): Promise<CommitAndPushWorkflowResult> {
    const preflight = await runCommitAndPushPreflight(context, options, gitCommitPort);
    if (preflight.status === 'failure') {
        return { success: false, committed: false, error: preflight.error };
    }
    if (preflight.status === 'success') {
        logDebugInfo(options.noChangesMessage);
        return { success: true, committed: false };
    }

    try {
        const { name, email } = await gitCommitPort.getAuthenticatedUserDetails();
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
        const semanticError = toApplicationError(error, 'workflow.failed', 'Commit or push failed.');
        logError(semanticError);
        return { success: false, committed: false, error: semanticError.message };
    }
}
