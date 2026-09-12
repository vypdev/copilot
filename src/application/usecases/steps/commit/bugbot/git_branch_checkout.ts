import type { GitCommitPort } from '../../../../ports/git_ports';
import { logDebugInfo, logError, logInfo } from "../../../../ports/logging_ports";
import { toApplicationError } from '../../../../errors/application_error';

const STASH_MESSAGE = "bugbot-autofix-before-checkout";

async function hasUncommittedChanges(gitCommitPort: GitCommitPort): Promise<boolean> {
    let output = "";
    await gitCommitPort.execute("git", ["status", "--porcelain"], {
        stdout: (data: Buffer) => {
            output += data.toString();
        },
    });
    return output.trim().length > 0;
}

/** Infrastructure boundary for checking out a branch without losing workspace changes. */
export async function checkoutBranch(
    branch: string,
    gitCommitPort: GitCommitPort,
    token?: string,
): Promise<boolean> {
    let didStash = false;
    try {
        didStash = await stashWorkspaceChanges(gitCommitPort);
        await gitCommitPort.fetch(branch, token);
        await gitCommitPort.execute("git", ["checkout", branch]);
        logInfo(`Checked out branch ${branch}.`);
        return didStash ? restoreStashedChanges(gitCommitPort) : true;
    } catch (err) {
        const semanticError = toApplicationError(err, 'workflow.failed', `Failed to checkout branch ${branch}.`);
        logError(semanticError);
        if (didStash) logError("Changes were stashed; run 'git stash pop' manually to restore them.");
        return false;
    }
}

async function stashWorkspaceChanges(gitCommitPort: GitCommitPort): Promise<boolean> {
    if (!await hasUncommittedChanges(gitCommitPort)) return false;
    logDebugInfo("Uncommitted changes present; stashing before checkout.");
    await gitCommitPort.execute("git", ["stash", "push", "-u", "-m", STASH_MESSAGE]);
    return true;
}

async function restoreStashedChanges(gitCommitPort: GitCommitPort): Promise<boolean> {
    try {
        await gitCommitPort.execute("git", ["stash", "pop"]);
        logDebugInfo("Restored stashed changes after checkout.");
        return true;
    } catch (error) {
        const semanticError = toApplicationError(error, 'workflow.failed', 'Failed to restore stashed changes after checkout.');
        logError(semanticError);
        logError("Changes remain stashed; run 'git stash pop' manually to restore them.");
        return false;
    }
}
