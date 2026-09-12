import { logInfo } from '../../../../ports/logging_ports';
import { runUserRequestCommitAndPush } from './bugbot_autofix_commit';
import { Result } from '../../../../../data/model/result';
import type { BugbotGitMutationPort } from '../../../../../application/ports/bugbot_git_ports';
import { sanitizePublishedError } from '../../../../../application/policies/github_comment_publication_policy';
import { ApplicationError } from '../../../../errors/application_error';
import type { BugbotCommitContext } from './bugbot_review_operation_context';

export async function commitUserRequestIfSuccessful(
    context: BugbotCommitContext,
    branchOverride: string | undefined,
    results: Result[],
    gitCommitPort: BugbotGitMutationPort,
): Promise<Result[]> {
    if (!results.at(-1)?.success) {
        logInfo('Do user request did not succeed; skipping commit.');
        return [];
    }
    logInfo('Do user request succeeded; running commit and push.');
    const payload = results.at(-1)?.payload as {
        workspacePaths?: string[];
        branchCheckedOut?: boolean;
    } | undefined;
    const commitResult = await runUserRequestCommitAndPush(context, {
        branchOverride,
        branchAlreadyCheckedOut: payload?.branchCheckedOut,
        workspacePaths: payload?.workspacePaths,
    }, gitCommitPort);
    if (!commitResult.success) {
        const message = sanitizePublishedError(commitResult.error) || 'Commit or push failed after user request.';
        return [new Result({
            id: 'DoUserRequestCommitAndPush',
            success: false,
            executed: true,
            errors: [new ApplicationError('provider.unavailable', message, { cause: commitResult.error })],
        })];
    }
    return [new Result({
        id: 'DoUserRequestCommitAndPush',
        success: true,
        executed: commitResult.committed,
        steps: [commitResult.committed ? 'User request changes committed and pushed.' : 'No changes were produced by the user request.'],
    })];
}
