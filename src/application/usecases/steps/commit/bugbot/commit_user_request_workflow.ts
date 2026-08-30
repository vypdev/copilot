import { logInfo } from '../../../../ports/logging_ports';
import { runUserRequestCommitAndPush } from './bugbot_autofix_commit';
import { Result } from '../../../../../data/model/result';
import type { Execution } from '../../../../../data/model/execution';
import type { AuthenticatedUserPort } from '../../../../../application/ports/authenticated_user_ports';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import { sanitizePublishedError } from '../../../../../application/policies/github_comment_publication_policy';

export async function commitUserRequestIfSuccessful(
    param: Execution,
    branchOverride: string | undefined,
    results: Result[],
    authenticatedUserPort: AuthenticatedUserPort,
    gitCommitPort: GitCommitPort,
): Promise<Result[]> {
    if (!results.at(-1)?.success) {
        logInfo('Do user request did not succeed; skipping commit.');
        return [];
    }
    logInfo('Do user request succeeded; running commit and push.');
    const commitResult = await runUserRequestCommitAndPush(param, { branchOverride }, authenticatedUserPort, gitCommitPort);
    if (!commitResult.success) {
        const message = sanitizePublishedError(commitResult.error) || 'Commit or push failed after user request.';
        return [new Result({
            id: 'DoUserRequestCommitAndPush',
            success: false,
            executed: true,
            errors: [message],
        })];
    }
    return [new Result({
        id: 'DoUserRequestCommitAndPush',
        success: true,
        executed: commitResult.committed,
        steps: [commitResult.committed ? 'User request changes committed and pushed.' : 'No changes were produced by the user request.'],
    })];
}
