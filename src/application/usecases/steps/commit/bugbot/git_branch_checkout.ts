import type { GitCommitPort } from '../../../../ports/git_ports';
import { logDebugInfo, logError, logInfo } from "../../../../ports/logging_ports";

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
export async function checkoutBranch(branch: string, gitCommitPort: GitCommitPort): Promise<boolean> {
    let didStash = false;
    try {
        didStash = await stashWorkspaceChanges(gitCommitPort);
        await gitCommitPort.execute("git", ["fetch", "origin", branch]);
        await gitCommitPort.execute("git", ["checkout", branch]);
        logInfo(`Checked out branch ${branch}.`);
        return didStash ? restoreStashedChanges(gitCommitPort) : true;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(`Failed to checkout branch ${branch}: ${msg}`);
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
        const message = error instanceof Error ? error.message : String(error);
        logError(`Failed to restore stashed changes after checkout: ${message}`);
        logError("Changes remain stashed; run 'git stash pop' manually to restore them.");
        return false;
    }
}
