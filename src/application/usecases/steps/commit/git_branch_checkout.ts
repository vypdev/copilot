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
    await port.execute('git', ['status', '--porcelain'], {
        stdout: (data: Buffer) => {
            output += data.toString();
        },
    });
    return output.trim().length > 0;
}

/** Checks out a branch through an already authority-bound Git capability. */
export async function checkoutBranch(
    branch: string,
    port: BranchCheckoutPort,
): Promise<boolean> {
    let didStash = false;
    try {
        didStash = await stashWorkspaceChanges(port);
        await port.fetch(branch);
        await port.execute('git', ['checkout', branch]);
        logInfo(`Checked out branch ${branch}.`);
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
    await port.execute('git', ['stash', 'push', '-u', '-m', STASH_MESSAGE]);
    return true;
}

async function restoreStashedChanges(port: BranchCheckoutPort): Promise<boolean> {
    try {
        await port.execute('git', ['stash', 'pop']);
        logDebugInfo('Restored stashed changes after checkout.');
        return true;
    } catch (error) {
        const semanticError = toApplicationError(error, 'workflow.failed', 'Failed to restore stashed changes after checkout.');
        logError(semanticError);
        logError("Changes remain stashed; run 'git stash pop' manually to restore them.");
        return false;
    }
}
