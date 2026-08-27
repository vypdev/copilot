import { CommentLanguageTranslationWorkflow, TRANSLATED_COMMENT_MARKER } from '../comment_language_translation_workflow';

describe('CommentLanguageTranslationWorkflow', () => {
    it('returns a skipped result for an already translated comment', async () => {
        const query = jest.fn();
        const updateComment = jest.fn();
        const workflow = new CommentLanguageTranslationWorkflow({ updateComment }, { query });
        const results = await workflow.invoke({
            taskId: 'translation',
            commentBody: `body\n${TRANSLATED_COMMENT_MARKER}`,
            locale: 'Spanish',
            issueNumber: 1,
            commentId: 2,
            owner: 'owner',
            repo: 'repo',
            token: 'token',
            configuration: undefined,
        });
        expect(results[0].executed).toBe(false);
        expect(query).not.toHaveBeenCalled();
        expect(updateComment).not.toHaveBeenCalled();
    });
});
