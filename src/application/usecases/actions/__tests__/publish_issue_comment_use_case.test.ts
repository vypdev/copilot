import type { Execution } from '../../../../data/model/execution';
import { ACTIONS } from '../../../../data/model/action_types';
import { SingleAction } from '../../../../data/model/single_action';
import { getCommentWatermark } from '../../../../utils/comment_watermark';
import { PublishIssueCommentUseCase } from '../publish_issue_comment_use_case';

const addComment = jest.fn();
const updateComment = jest.fn();
const listIssueComments = jest.fn();

function execution(message: string, commentId = '', mode = ''): Execution {
    return {
        owner: 'owner',
        repo: 'repo',
        tokens: { token: 'token' },
        singleAction: new SingleAction(
            ACTIONS.PUBLISH_ISSUE_COMMENT,
            '42',
            '',
            '',
            '',
            message,
            commentId,
            mode,
        ),
    } as unknown as Execution;
}

describe('PublishIssueCommentUseCase', () => {
    const useCase = new PublishIssueCommentUseCase({ addComment, updateComment, listIssueComments });

    beforeEach(() => {
        jest.clearAllMocks();
        addComment.mockResolvedValue(undefined);
        updateComment.mockResolvedValue(undefined);
        listIssueComments.mockResolvedValue([]);
    });

    it('creates a comment when no comment ID is provided', async () => {
        const results = await useCase.invoke(execution('Deployment failed.'));

        expect(results[0]).toMatchObject({ success: true, executed: true, steps: [] });
        expect(addComment).toHaveBeenCalledWith('owner', 'repo', 42, 'Deployment failed.', 'token');
        expect(listIssueComments).not.toHaveBeenCalled();
    });

    it('replaces the selected issue comment by default when an ID is provided', async () => {
        listIssueComments.mockResolvedValue([{ id: 101, body: 'Deployment started.' }]);

        const results = await useCase.invoke(execution('Deployment failed.', '101'));

        expect(results[0].success).toBe(true);
        expect(updateComment).toHaveBeenCalledWith('owner', 'repo', 42, 101, 'Deployment failed.', 'token');
    });

    it('appends after existing content without duplicating its Copilot watermark', async () => {
        listIssueComments.mockResolvedValue([{
            id: 101,
            body: `Deployment started.\n\n${getCommentWatermark()}`,
        }]);

        const results = await useCase.invoke(execution('Deployment failed.', '101', 'append'));

        expect(results[0].success).toBe(true);
        expect(updateComment).toHaveBeenCalledWith(
            'owner',
            'repo',
            42,
            101,
            'Deployment started.\n\nDeployment failed.',
            'token',
        );
    });

    it.each([null, ''])('uses only the new content when an appended comment has no existing body (%p)', async (body) => {
        listIssueComments.mockResolvedValue([{ id: 101, body }]);

        const results = await useCase.invoke(execution('Deployment failed.', '101', 'append'));

        expect(results[0].success).toBe(true);
        expect(updateComment).toHaveBeenCalledWith(
            'owner',
            'repo',
            42,
            101,
            'Deployment failed.',
            'token',
        );
    });

    it('rejects updates when the comment does not belong to the selected issue', async () => {
        const results = await useCase.invoke(execution('Deployment failed.', '101', 'replace'));

        expect(results[0].success).toBe(false);
        expect(results[0].errors[0].message).toContain('does not belong to issue 42');
        expect(updateComment).not.toHaveBeenCalled();
    });

    it.each([
        { message: '', id: '', mode: '', error: 'single-action-message' },
        { message: 'Message', id: '', mode: 'append', error: 'single-action-comment-id' },
        { message: 'Message', id: '', mode: 'merge', error: 'single-action-comment-mode' },
        { message: 'Message', id: '101', mode: 'create', error: 'single-action-comment-id' },
        { message: 'Message', id: 'not-an-id', mode: '', error: 'single-action-comment-id' },
    ])('rejects an invalid publication request: $error', async ({ message, id, mode, error }) => {
        const results = await useCase.invoke(execution(message, id, mode));

        expect(results[0].success).toBe(false);
        expect(results[0].errors[0].message).toContain(error);
        expect(addComment).not.toHaveBeenCalled();
        expect(updateComment).not.toHaveBeenCalled();
    });

    it('returns a failure result when GitHub rejects the publication', async () => {
        addComment.mockRejectedValue(new Error('API error'));

        const results = await useCase.invoke(execution('Deployment failed.'));

        expect(results[0].success).toBe(false);
        expect(results[0].errors[0]).toMatchObject({
            code: 'provider.unavailable',
            message: 'Unable to publish the issue comment.',
        });
        expect(JSON.stringify(results[0])).not.toContain('API error');
    });
});
