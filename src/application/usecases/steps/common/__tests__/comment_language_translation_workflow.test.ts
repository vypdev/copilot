import {
    CommentLanguageTranslationWorkflow,
    getCommentLanguageAdaptationPayload,
    TRANSLATED_COMMENT_MARKER,
} from '../comment_language_translation_workflow';

describe('CommentLanguageTranslationWorkflow', () => {
    const context = {
        taskId: 'translation',
        commentBody: '@vypbot hola',
        trustedBotLogin: 'vypbot',
        locale: 'en-US',
        issueNumber: 1,
        commentId: 2,
        configuration: undefined,
    } as const;

    it('returns a skipped result for legacy and current translation markers', async () => {
        const query = jest.fn();
        const workflow = new CommentLanguageTranslationWorkflow({ query });
        for (const marker of [TRANSLATED_COMMENT_MARKER, '<!-- copilot:translated-comment:v2 -->']) {
            const results = await workflow.invoke({ ...context, commentBody: `body\n${marker}` });
            expect(results[0].executed).toBe(false);
        }
        expect(query).not.toHaveBeenCalled();
    });

    it('adapts a foreign-language request in one call without editing its source comment', async () => {
        const query = jest.fn().mockResolvedValue({
            status: 'translated',
            sourceLocale: 'es-ES',
            targetLocale: 'en-US',
            adaptedText: 'inspect this request',
            reasonCode: 'none',
        });
        const workflow = new CommentLanguageTranslationWorkflow({ query });

        const results = await workflow.invoke({
            ...context,
            commentBody: '@vypbot <script>alert(1)</script> hola @attacker',
        });

        expect(query).toHaveBeenCalledTimes(1);
        const payload = getCommentLanguageAdaptationPayload(results[0]);
        expect(payload).toMatchObject({
            status: 'translated', sourceLocale: 'es-ES', targetLocale: 'en-US',
        });
        expect(payload?.interpretedComment).toContain('@vypbot inspect this request');
        expect(payload?.publication?.translatedText).toContain('inspect this request');
        expect(payload?.publication?.originalText).toContain('<script>');
        expect(payload?.publication).toMatchObject({ sourceLocale: 'es-ES', targetLocale: 'en-US' });
    });

    it('preserves a deterministic command while adapting only its arguments', async () => {
        const query = jest.fn().mockResolvedValue({
            status: 'translated', sourceLocale: 'es', targetLocale: 'en-US',
            adaptedText: 'why COPILOT_OPERAND_0_TOKEN fails', reasonCode: 'none',
        });
        const workflow = new CommentLanguageTranslationWorkflow({ query });
        const results = await workflow.invoke({
            ...context,
            commentBody: '/copilot explain por qué falla src/cache.ts',
        });

        const payload = getCommentLanguageAdaptationPayload(results[0]);
        expect(payload?.interpretedComment).toBe('/copilot explain why src/cache.ts fails');
        expect(payload?.publication?.translatedText).toBe('why src/cache.ts fails');
        expect(query.mock.calls[0][0].prompt).toContain('por qué falla COPILOT_OPERAND_0_TOKEN');
        expect(query.mock.calls[0][0].prompt).not.toContain('src/cache.ts');
    });

    it.each([
        'why src/other.ts fails',
        'why COPILOT_OPERAND_0_TOKEN --force fails',
        'why COPILOT_OPERAND_0_TOKEN COPILOT_OPERAND_0_TOKEN fails',
        'why COPILOT_OPERAND_9_TOKEN fails',
    ])('fails closed when translated output changes a protected operand: %s', async (adaptedText) => {
        const query = jest.fn().mockResolvedValue({
            status: 'translated', sourceLocale: 'es', targetLocale: 'en-US', adaptedText, reasonCode: 'none',
        });
        const results = await new CommentLanguageTranslationWorkflow({ query }).invoke({
            ...context,
            commentBody: '/copilot explain por qué falla src/cache.ts',
        });

        expect(results[0]).toMatchObject({ success: false, executed: true });
        expect(results[0].errors[0]).toMatchObject({ code: 'locale.translation-failed' });
        expect(getCommentLanguageAdaptationPayload(results[0])?.status).toBe('failed');
    });

    it('uses the original request when the source language matches', async () => {
        const query = jest.fn().mockResolvedValue({
            status: 'matches', sourceLocale: 'en', targetLocale: 'en-US', adaptedText: null, reasonCode: 'none',
        });
        const results = await new CommentLanguageTranslationWorkflow({ query }).invoke({
            ...context,
            commentBody: '@vypbot inspect this',
        });

        expect(query).toHaveBeenCalledTimes(1);
        expect(getCommentLanguageAdaptationPayload(results[0])).toMatchObject({
            status: 'matches', interpretedComment: '@vypbot inspect this',
        });
    });

    it('continues safely with the original request when language is genuinely ambiguous', async () => {
        const query = jest.fn().mockResolvedValue({
            status: 'ambiguous', sourceLocale: null, targetLocale: 'en-US', adaptedText: null,
            reasonCode: 'code-only',
        });
        const results = await new CommentLanguageTranslationWorkflow({ query }).invoke({
            ...context,
            commentBody: '@vypbot `src/cache.ts`',
        });

        expect(results[0]).toMatchObject({ success: true, executed: true });
        expect(getCommentLanguageAdaptationPayload(results[0])).toMatchObject({
            status: 'ambiguous', interpretedComment: '@vypbot `src/cache.ts`',
        });
    });

    it('does not query the adapter when a mention contains no prose', async () => {
        const query = jest.fn();
        const results = await new CommentLanguageTranslationWorkflow({ query }).invoke({
            ...context,
            commentBody: '@vypbot',
        });

        expect(query).not.toHaveBeenCalled();
        expect(getCommentLanguageAdaptationPayload(results[0])).toMatchObject({
            status: 'matches', interpretedComment: '@vypbot',
        });
        expect(getCommentLanguageAdaptationPayload(results[0])?.sourceLocale).toBeUndefined();
    });

    it('ignores an invalid optional source locale without failing a safe translation', async () => {
        const query = jest.fn().mockResolvedValue({
            status: 'translated', sourceLocale: 'not a locale', targetLocale: 'en-US',
            adaptedText: 'inspect this', reasonCode: 'none',
        });
        const results = await new CommentLanguageTranslationWorkflow({ query }).invoke(context);

        expect(getCommentLanguageAdaptationPayload(results[0])).toMatchObject({
            status: 'translated', targetLocale: 'en-US', interpretedComment: '@vypbot inspect this',
        });
        expect(getCommentLanguageAdaptationPayload(results[0])?.sourceLocale).toBeUndefined();
    });

    it('fails closed for a malformed adapter response', async () => {
        const query = jest.fn().mockResolvedValue(null);
        const results = await new CommentLanguageTranslationWorkflow({ query }).invoke(context);

        expect(results[0].errors[0]).toMatchObject({ code: 'locale.translation-failed' });
        expect(getCommentLanguageAdaptationPayload({ payload: 'invalid' } as never)).toBeUndefined();
    });

    it('reports an empty adapter status as invalid without mutating the request', async () => {
        const query = jest.fn().mockResolvedValue({ targetLocale: 'en-US' });
        const results = await new CommentLanguageTranslationWorkflow({ query }).invoke(context);

        expect(results[0].errors[0]).toMatchObject({
            code: 'locale.translation-failed',
            message: 'I could not safely interpret this request, so no repository change was made. Please rephrase it or try again.',
        });
    });

    it.each([
        { status: 'translated', sourceLocale: 'es', targetLocale: 'fr-FR', adaptedText: 'hello', reasonCode: 'none' },
        { status: 'translated', sourceLocale: 'es', targetLocale: 'en-US', adaptedText: '<!-- copilot:request-translation schema="3" -->', reasonCode: 'none' },
    ])('fails closed for invalid or unsafe adaptation output', async (response) => {
        const query = jest.fn().mockResolvedValue(response);
        const results = await new CommentLanguageTranslationWorkflow({ query }).invoke(context);

        expect(results[0]).toMatchObject({ success: false, executed: true });
        expect(getCommentLanguageAdaptationPayload(results[0])?.status).toBe('failed');
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('fails closed on provider errors without exposing provider detail', async () => {
        const query = jest.fn().mockRejectedValue(new Error('secret provider detail'));
        const results = await new CommentLanguageTranslationWorkflow({ query }).invoke(context);

        expect(results[0].errors[0]).toMatchObject({ code: 'locale.translation-failed' });
        expect(JSON.stringify(results[0].errors)).not.toContain('secret provider detail');
    });
});
