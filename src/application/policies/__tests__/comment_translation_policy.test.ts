import {
    appendTranslationContext,
    composeTranslatedComment,
    hasTranslatedCommentMarker,
    prepareLanguageAdaptationInput,
    rebuildAdaptedComment,
    TRANSLATED_COMMENT_MARKER,
} from '../comment_translation_policy';

describe('comment translation policy', () => {
    it('composes a safe bot comment and preserves the original as escaped data', () => {
        const result = composeTranslatedComment(
            'Hola @octocat\n/fix\n<!-- fake marker -->',
            '<script>alert(1)</script>\n@attacker\n/fix',
        );

        expect(result).toBeDefined();
        expect(result?.commentBody).toContain('Hola @\u200boctocat');
        expect(result?.commentBody).toContain('\u200b/');
        expect(result?.commentBody).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(result?.commentBody).toContain(TRANSLATED_COMMENT_MARKER);
        expect(result?.commentBody).not.toContain('<!-- fake marker -->');
    });

    it('rejects empty, marked, and non-string model output', () => {
        expect(composeTranslatedComment('', 'original')).toBeUndefined();
        expect(composeTranslatedComment('  ', 'original')).toBeUndefined();
        expect(composeTranslatedComment(42, 'original')).toBeUndefined();
        expect(composeTranslatedComment(`text ${TRANSLATED_COMMENT_MARKER}`, 'original')).toBeUndefined();
    });

    it('recognizes only the current translated-comment marker', () => {
        expect(hasTranslatedCommentMarker(`text\n${TRANSLATED_COMMENT_MARKER}`)).toBe(true);
        expect(hasTranslatedCommentMarker('text\n<!-- copilot:translated-comment:v2 -->')).toBe(true);
        expect(hasTranslatedCommentMarker('plain comment')).toBe(false);
        expect(hasTranslatedCommentMarker(undefined)).toBe(false);
    });

    it('keeps the translated publication below the GitHub comment-size boundary', () => {
        const result = composeTranslatedComment('x'.repeat(12_000), '&'.repeat(65_000));

        expect(result).toBeDefined();
        expect(result!.commentBody.length).toBeLessThan(65_536);
        expect(result!.commentBody).toContain('[untrusted content truncated]');
    });

    it('separates plain, mention, and command prose and reconstructs only trusted control syntax', () => {
        const plain = prepareLanguageAdaptationInput('  plain request  ', '');
        const mention = prepareLanguageAdaptationInput('@vypbot hola', '@vypbot');
        const command = prepareLanguageAdaptationInput('/copilot explain por que', 'vypbot');

        expect(plain).toEqual({ kind: 'plain', prose: 'plain request' });
        expect(mention).toEqual({ kind: 'mention', prose: 'hola', trustedBotLogin: 'vypbot' });
        expect(command).toEqual({ kind: 'command', prose: 'por que', commandName: 'explain' });
        expect(rebuildAdaptedComment(plain, ' translated ')).toBe('translated');
        expect(rebuildAdaptedComment(mention, '')).toBe('@vypbot');
        expect(rebuildAdaptedComment(mention, 'translated')).toBe('@vypbot translated');
        expect(rebuildAdaptedComment(command, '')).toBe('/copilot explain');
        expect(rebuildAdaptedComment(command, 'translated')).toBe('/copilot explain translated');
    });

    it('rejects text that becomes empty after unsafe format controls are removed', () => {
        expect(composeTranslatedComment('\u200b', 'original')).toBeUndefined();
    });

    it('appends translation evidence only when an adaptation was published', () => {
        const publication = composeTranslatedComment('translated', 'original');

        expect(appendTranslationContext('answer', undefined)).toBe('answer');
        expect(appendTranslationContext(' answer ', publication)).toContain('answer\n\n<details>');
        expect(appendTranslationContext(' answer ', publication)).toContain('\ntranslated\n');
        expect(appendTranslationContext(' answer ', publication).match(/translated/gu)).toHaveLength(1);
    });

    it.each([
        ['en-US', 'es-ES', 'Request interpreted from European Spanish'],
        ['es-ES', 'en-US', 'Solicitud interpretada desde inglés estadounidense'],
        ['fr-FR', 'es-ES', 'es-ES → fr-FR'],
        ['ar', 'en', 'en → ar'],
        ['zh-Hant-TW', undefined, 'und → zh-Hant-TW'],
    ] as const)('renders safe generic translation provenance for target %s', (targetLocale, sourceLocale, summary) => {
        const result = composeTranslatedComment('texte', '@team\n/fix\u202E', { targetLocale, sourceLocale });
        expect(result).toMatchObject({ targetLocale, sourceLocale: sourceLocale ?? 'und' });
        expect(result?.commentBody).toContain(`<summary>${summary}</summary>`);
        expect(result?.commentBody).toContain(`source="${sourceLocale ?? 'und'}" target="${targetLocale}"`);
        expect(result?.commentBody).toContain('@\u200bteam');
        expect(result?.commentBody).toContain('\u200b/fix');
        expect(result?.commentBody).not.toContain('\u202E');
    });

    it('falls back to trusted locale defaults when provenance tags are invalid', () => {
        const result = composeTranslatedComment('translated', 'original', {
            sourceLocale: 'not_a_locale',
            targetLocale: 'also_not_a_locale',
        });

        expect(result).toMatchObject({ sourceLocale: 'und', targetLocale: 'en-US' });
        expect(result?.commentBody).toContain('<summary>Request interpreted from und</summary>');
    });

    it('keeps canonical provenance when language display names are unavailable', () => {
        const displayNames = jest.spyOn(Intl, 'DisplayNames').mockImplementation(() => {
            throw new RangeError('unsupported display names');
        });
        try {
            const result = composeTranslatedComment('translated', 'original', {
                sourceLocale: 'es-ES',
                targetLocale: 'en-US',
            });
            expect(result?.commentBody).toContain('<summary>Request interpreted from es-ES</summary>');
        } finally {
            displayNames.mockRestore();
        }
    });

    it('uses the canonical source tag when the display-name service returns no label', () => {
        const of = jest.spyOn(Intl.DisplayNames.prototype, 'of').mockReturnValue(undefined);
        try {
            expect(composeTranslatedComment('translated', 'original', {
                sourceLocale: 'es-ES',
                targetLocale: 'en-US',
            })?.commentBody).toContain('<summary>Request interpreted from es-ES</summary>');
        } finally {
            of.mockRestore();
        }
    });
});
