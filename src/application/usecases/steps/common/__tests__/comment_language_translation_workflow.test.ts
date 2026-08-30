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

    it('updates a foreign-language comment with a safe, idempotent publication', async () => {
        const query = jest.fn()
            .mockResolvedValueOnce({ status: 'must_translate' })
            .mockResolvedValueOnce({ translatedText: 'Hola @octocat\n/fix' });
        const updateComment = jest.fn().mockResolvedValue(undefined);
        const workflow = new CommentLanguageTranslationWorkflow({ updateComment }, { query });

        const results = await workflow.invoke({
            taskId: 'translation',
            commentBody: '<script>alert(1)</script>\n你好 @attacker\n/fix',
            locale: 'English',
            issueNumber: 1,
            commentId: 2,
            owner: 'owner',
            repo: 'repo',
            token: 'token',
            configuration: undefined,
        });

        expect(results).toEqual([]);
        expect(updateComment).toHaveBeenCalledTimes(1);
        const updatedBody = updateComment.mock.calls[0][4] as string;
        expect(updatedBody).toContain('Original comment (untrusted content)');
        expect(updatedBody).toContain('&lt;');
        expect(updatedBody).toContain('copilot:translated-comment:v2');
        expect(updatedBody).toContain('\n\u200b/'.replace('\\u200b', '\u200b'));
    });

    it('does not publish invalid or marker-bearing agent output', async () => {
        const query = jest.fn()
            .mockResolvedValueOnce({ status: 'must_translate' })
            .mockResolvedValueOnce({ translatedText: '<!-- copilot:translated-comment:v2 -->' });
        const updateComment = jest.fn();
        const workflow = new CommentLanguageTranslationWorkflow({ updateComment }, { query });

        const results = await workflow.invoke({
            taskId: 'translation',
            commentBody: 'Hola',
            locale: 'English',
            issueNumber: 1,
            commentId: 2,
            owner: 'owner',
            repo: 'repo',
            token: 'token',
            configuration: undefined,
        });

        expect(results[0].executed).toBe(false);
        expect(updateComment).not.toHaveBeenCalled();
    });
});
