import { toApplicationError } from '../../../errors/application_error';
import { logDebugInfo, logError, logInfo } from '../../../ports/logging_ports';

const STASH_MESSAGE = 'bugbot-autofix-before-checkout';

export interface BranchCheckoutPort {
    execute(program: string, args: string[], options?: {
        stdout?: (data: Buffer) => void;
    }): Promise<number>;
    fetch(branch: string): Promise<void>;
}

async function hasUncommittedChanges(port: BranchCheckoutPort): Promise<boolean> {
    let output = '';
    const code = await port.execute('git', ['status', '--porcelain'], {
        stdout: (data: Buffer) => {
            output += data.toString();
        },
    });
    if (code !== 0) throw new Error('Workspace status could not be read.');
    return output.trim().length > 0;
}

/** Checks out a branch through an already authority-bound Git capability. */
export async function checkoutBranch(
    branch: string,
    port: BranchCheckoutPort,
): Promise<boolean> {
    let didStash = false;
    try {
        if (!branch.trim() || branch.startsWith('-')) throw new Error('Invalid target branch.');
        didStash = await stashWorkspaceChanges(port);
        await port.fetch(branch);
        await checkedGit(port, ['checkout', branch]);
        // Self-hosted runners retain local branches between jobs. Checkout alone
        // can select an old local commit even after the exact remote was fetched.
        // Fast-forward only: retain divergent or unpublished local work on failure.
        await checkedGit(port, ['merge', '--ff-only', '--no-edit', 'FETCH_HEAD']);
        // A local branch ahead of the remote also makes merge report success.
        // The reverse ancestry check proves that HEAD equals the fetched commit.
        await checkedGit(port, ['merge-base', '--is-ancestor', 'HEAD', 'FETCH_HEAD']);
        logInfo(`Checked out verified fetched head of branch ${branch}.`);
        return didStash ? restoreStashedChanges(port) : true;
    } catch (err) {
        const semanticError = toApplicationError(err, 'workflow.failed', `Failed to checkout branch ${branch}.`);
        logError(semanticError);
        if (didStash) logError("Changes were stashed; run 'git stash pop' manually to restore them.");
        return false;
    }
}

async function stashWorkspaceChanges(port: BranchCheckoutPort): Promise<boolean> {
    if (!await hasUncommittedChanges(port)) return false;
    logDebugInfo('Uncommitted changes present; stashing before checkout.');
    await checkedGit(port, ['stash', 'push', '-u', '-m', STASH_MESSAGE]);
    return true;
}

async function restoreStashedChanges(port: BranchCheckoutPort): Promise<boolean> {
    try {
        await checkedGit(port, ['stash', 'pop']);
        logDebugInfo('Restored stashed changes after checkout.');
        return true;
    } catch (error) {
        const semanticError = toApplicationError(error, 'workflow.failed', 'Failed to restore stashed changes after checkout.');
        logError(semanticError);
        logError("Changes remain stashed; run 'git stash pop' manually to restore them.");
        return false;
    }
}

async function checkedGit(port: BranchCheckoutPort, args: string[]): Promise<void> {
    if (await port.execute('git', args) !== 0) throw new Error('Git branch preparation did not succeed.');
}
