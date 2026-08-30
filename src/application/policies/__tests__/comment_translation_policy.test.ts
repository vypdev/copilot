import {
    composeTranslatedComment,
    hasTranslatedCommentMarker,
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

    it('recognizes current and legacy translated comments for idempotency', () => {
        expect(hasTranslatedCommentMarker(`text\n${TRANSLATED_COMMENT_MARKER}`)).toBe(true);
        expect(hasTranslatedCommentMarker('text\n<!-- content_translated\nlegacy\n-->')).toBe(true);
        expect(hasTranslatedCommentMarker('plain comment')).toBe(false);
    });
});
