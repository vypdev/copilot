import { logInfo } from '../../../../../utils/logger';
import { runUserRequestCommitAndPush } from './bugbot_autofix_commit';
import type { Result } from '../../../../../data/model/result';
import type { Execution } from '../../../../../data/model/execution';
import type { AuthenticatedUserPort } from '../../../../../application/ports/authenticated_user_ports';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';

export async function commitUserRequestIfSuccessful(
    param: Execution,
    branchOverride: string | undefined,
    results: Result[],
    authenticatedUserPort: AuthenticatedUserPort,
    gitCommitPort: GitCommitPort,
): Promise<void> {
    if (!results.at(-1)?.success) {
        logInfo('Do user request did not succeed; skipping commit.');
        return;
    }
    logInfo('Do user request succeeded; running commit and push.');
    await runUserRequestCommitAndPush(param, { branchOverride }, authenticatedUserPort, gitCommitPort);
}
