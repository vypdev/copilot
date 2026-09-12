import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import { stripTrailingCommentWatermarks } from '../../../utils/comment_watermark';
import { resolveIssueCommentPublicationRequest } from '../../policies/issue_comment_publication_policy';
import type { IssueCommentPublicationPort } from '../../ports/issue_lifecycle_ports';
import { logError } from '../../ports/logging_ports';
import { ApplicationError, toApplicationError } from '../../errors/application_error';

export async function runPublishIssueComment(
    param: Execution,
    taskId: string,
    issueCommentPort: IssueCommentPublicationPort,
): Promise<Result[]> {
    const request = resolveIssueCommentPublicationRequest(param.singleAction);
    if (request instanceof Error) {
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            errors: [new ApplicationError('validation.invalid-input', request.message, { cause: request })],
        })];
    }

    try {
        if (request.mode === 'create') {
            await issueCommentPort.addComment(
                param.owner,
                param.repo,
                param.singleAction.issue,
                request.message,
                param.tokens.token,
            );
        } else {
            const comments = await issueCommentPort.listIssueComments(
                param.owner,
                param.repo,
                param.singleAction.issue,
                param.tokens.token,
            );
            const target = comments.find(({ id }) => id === request.commentId);
            if (!target) {
                return [new Result({
                    id: taskId,
                    success: false,
                    executed: true,
                    errors: [new ApplicationError('provider.not-found', `Comment ${request.commentId} does not belong to issue ${param.singleAction.issue}.`)],
                })];
            }
            const message = request.mode === 'append'
                ? appendCommentContent(target.body, request.message)
                : request.message;
            await issueCommentPort.updateComment(
                param.owner,
                param.repo,
                param.singleAction.issue,
                request.commentId,
                message,
                param.tokens.token,
            );
        }
        // This single action publishes its own comment. An empty step list keeps
        // the common completion phase from emitting a second issue comment.
        return [new Result({ id: taskId, success: true, executed: true })];
    } catch (error) {
        const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to publish the issue comment.');
        logError(semanticError);
        return [new Result({ id: taskId, success: false, executed: true, errors: [semanticError] })];
    }
}

function appendCommentContent(previous: string | null, addition: string): string {
    const existing = stripTrailingCommentWatermarks(previous ?? '');
    return existing.length > 0 ? `${existing}\n\n${addition}` : addition;
}
