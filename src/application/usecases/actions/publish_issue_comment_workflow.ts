import { Result } from '../../../data/model/result';
import { stripTrailingCommentWatermarks } from '../../../utils/comment_watermark';
import type { BoundIssueCommentPublicationPort } from '../../ports/issue_lifecycle_ports';
import type { IssueCommentActionContext } from '../push_single_action_contexts';
import { logError } from '../../ports/logging_ports';
import { ApplicationError, toApplicationError } from '../../errors/application_error';

export async function runPublishIssueComment(
    param: IssueCommentActionContext,
    taskId: string,
    issueCommentPort: BoundIssueCommentPublicationPort,
): Promise<Result[]> {
    if (param.kind === 'invalid') {
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            errors: [new ApplicationError('validation.invalid-input', param.message)],
        })];
    }
    const { request, issueNumber } = param;

    try {
        if (request.mode === 'create') {
            await issueCommentPort.addComment(
                issueNumber,
                request.message,
            );
        } else {
            const comments = await issueCommentPort.listIssueComments(
                issueNumber,
            );
            const target = comments.find(({ id }) => id === request.commentId);
            if (!target) {
                return [new Result({
                    id: taskId,
                    success: false,
                    executed: true,
                    errors: [new ApplicationError('provider.not-found', `Comment ${request.commentId} does not belong to issue ${issueNumber}.`)],
                })];
            }
            const message = request.mode === 'append'
                ? appendCommentContent(target.body, request.message)
                : request.message;
            await issueCommentPort.updateComment(
                issueNumber,
                request.commentId,
                message,
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
