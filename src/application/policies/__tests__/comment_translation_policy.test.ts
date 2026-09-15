import {
    composeTranslatedComment,
    hasTranslatedCommentMarker,
    prepareLanguageAdaptationInput,
    rebuildAdaptedComment,
    renderTranslationContext,
    restoreLanguageAdaptationOutput,
    TRANSLATED_COMMENT_MARKER,
} from '../comment_translation_policy';
import {
    ENGLISH_PUBLICATION_CATALOG,
    SPANISH_PUBLICATION_CATALOG,
} from '../publication_message_catalog';

describe('comment translation policy', () => {
    it('composes a safe bot comment and preserves the original as escaped data', () => {
        const result = composeTranslatedComment(
            'Hola @octocat\n/fix\n<!-- fake marker -->',
            '<script>alert(1)</script>\n@attacker\n/fix',
        );

        expect(result).toBeDefined();
        expect(result?.translatedText).toContain('Hola @\u200boctocat');
        expect(result?.translatedText).toContain('\u200b/');
        expect(result?.originalText).toContain('<script>alert(1)</script>');
        expect(result?.translatedText).not.toContain('<!-- fake marker -->');
        const rendered = renderTranslationContext(result!, ENGLISH_PUBLICATION_CATALOG);
        expect(rendered).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(rendered).not.toContain('<script>');
        expect(rendered).toContain(TRANSLATED_COMMENT_MARKER);
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
        const rendered = renderTranslationContext(result!, ENGLISH_PUBLICATION_CATALOG);
        expect(rendered.length).toBeLessThan(65_536);
        expect(rendered).toContain('[untrusted content truncated]');
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
        expect(rebuildAdaptedComment({ kind: 'mention', prose: 'plain' }, 'translated')).toBe('translated');
        expect(rebuildAdaptedComment(command, '')).toBe('/copilot explain');
        expect(rebuildAdaptedComment(command, 'translated')).toBe('/copilot explain translated');
    });

    it('protects technical operands from translation and restores them only after exact validation', () => {
        const input = prepareLanguageAdaptationInput(
            '/copilot explain por qué falla `src/cache.ts` en feature/cache --verbose https://example.com/log a1b2c3d',
            'vypbot',
        );

        expect(input.prose).toBe(
            'por qué falla COPILOT_OPERAND_0_TOKEN en COPILOT_OPERAND_1_TOKEN COPILOT_OPERAND_2_TOKEN COPILOT_OPERAND_3_TOKEN COPILOT_OPERAND_4_TOKEN',
        );
        expect(input.protectedOperands?.map(operand => operand.value)).toEqual([
            '`src/cache.ts`', 'feature/cache', '--verbose', 'https://example.com/log', 'a1b2c3d',
        ]);
        expect(Object.isFrozen(input.protectedOperands)).toBe(true);
        expect(input.protectedOperands?.every(Object.isFrozen)).toBe(true);

        const translated = 'why COPILOT_OPERAND_0_TOKEN fails on COPILOT_OPERAND_1_TOKEN COPILOT_OPERAND_2_TOKEN COPILOT_OPERAND_3_TOKEN COPILOT_OPERAND_4_TOKEN';
        expect(restoreLanguageAdaptationOutput(input, translated)).toBe(
            'why `src/cache.ts` fails on feature/cache --verbose https://example.com/log a1b2c3d',
        );
        expect(rebuildAdaptedComment(input, translated)).toContain(
            '/copilot explain why `src/cache.ts` fails on feature/cache --verbose',
        );
    });

    it.each([
        'translated without the required placeholder',
        'translated COPILOT_OPERAND_0_TOKEN COPILOT_OPERAND_0_TOKEN',
        'translated COPILOT_OPERAND_9_TOKEN',
        'translated COPILOT_OPERAND_0_TOKEN COPILOT_OPERAND_9_TOKEN',
        'translated COPILOT_OPERAND_0_TOKEN --force',
        'translated COPILOT_OPERAND_0_TOKEN src/other.ts',
        'translated COPILOT_OPERAND_0_TOKEN https://attacker.example',
        'translated COPILOT_OPERAND_0_TOKEN "different literal"',
    ])('rejects missing, duplicated, unknown, or generated technical operands: %s', (translated) => {
        const input = prepareLanguageAdaptationInput('/copilot explain src/cache.ts', 'vypbot');

        expect(restoreLanguageAdaptationOutput(input, translated)).toBeUndefined();
        expect(rebuildAdaptedComment(input, translated)).toBeUndefined();
    });

    it('rejects an operand placeholder invented for prose that had no protected values', () => {
        const input = prepareLanguageAdaptationInput('@vypbot explica esto', 'vypbot');

        expect(restoreLanguageAdaptationOutput(input, 'explain COPILOT_OPERAND_0_TOKEN')).toBeUndefined();
    });

    it('rejects text that becomes empty after unsafe format controls are removed', () => {
        expect(composeTranslatedComment('\u200b', 'original')).toBeUndefined();
    });

    it('renders translation evidence only at the publication boundary', () => {
        const publication = composeTranslatedComment('translated', 'original');
        const rendered = renderTranslationContext(publication!, ENGLISH_PUBLICATION_CATALOG);

        expect(rendered).toContain('<details>');
        expect(rendered).toContain('**Interpreted request**');
        expect(rendered).toContain('\ntranslated\n');
        expect(rendered).toContain('**Original request**');
        expect(rendered).toContain(TRANSLATED_COMMENT_MARKER);
    });

    it('omits incomplete translation evidence at the publication boundary', () => {
        expect(renderTranslationContext({
            translatedText: '   ',
            originalText: 'original',
            sourceLocale: 'es-ES',
            targetLocale: 'en-US',
        }, ENGLISH_PUBLICATION_CATALOG)).toBe('');
        expect(renderTranslationContext({
            translatedText: 'translated',
            originalText: '   ',
            sourceLocale: 'es-ES',
            targetLocale: 'en-US',
        }, ENGLISH_PUBLICATION_CATALOG)).toBe('');
    });

    it.each([
        ['en-US', 'es-ES', ENGLISH_PUBLICATION_CATALOG, 'Request interpreted from European Spanish'],
        ['es-ES', 'en-US', SPANISH_PUBLICATION_CATALOG, 'Solicitud interpretada desde inglés estadounidense'],
    ] as const)('renders localized translation provenance for target %s', (targetLocale, sourceLocale, catalog, summary) => {
        const result = composeTranslatedComment('texte', '@team\n/fix\u202E', { targetLocale, sourceLocale });
        const rendered = renderTranslationContext(result!, catalog);
        expect(result).toMatchObject({ targetLocale, sourceLocale: sourceLocale ?? 'und' });
        expect(rendered).toContain(`<summary>${summary}</summary>`);
        expect(rendered).toContain(`source="${sourceLocale ?? 'und'}" target="${targetLocale}"`);
        expect(rendered).toContain('@\u200bteam');
        expect(rendered).toContain('\u200b/fix');
        expect(rendered).not.toContain('\u202E');
    });

    it('uses an arbitrary resolved catalog instead of branching on locale names', () => {
        const publication = composeTranslatedComment('inspectez ceci', 'inspect this', {
            sourceLocale: 'en-US', targetLocale: 'fr-FR',
        });
        const frenchCatalog = Object.freeze({
            ...ENGLISH_PUBLICATION_CATALOG,
            locale: 'fr-FR',
            requestedLocale: 'fr-FR',
            translation: Object.freeze({
                summary: (sourceLanguage: string) => `Demande interprétée depuis ${sourceLanguage}`,
                interpretedRequest: 'Demande interprétée',
                originalRequest: 'Demande originale',
            }),
        });

        const rendered = renderTranslationContext(publication!, frenchCatalog);
        expect(rendered).toContain('Demande interprétée depuis anglais américain');
        expect(rendered).toContain('**Demande interprétée**');
        expect(rendered).toContain('**Demande originale**');
    });

    it('falls back to trusted locale defaults when provenance tags are invalid', () => {
        const result = composeTranslatedComment('translated', 'original', {
            sourceLocale: 'not_a_locale',
            targetLocale: 'also_not_a_locale',
        });

        expect(result).toMatchObject({ sourceLocale: 'und', targetLocale: 'en-US' });
        expect(renderTranslationContext(result!, ENGLISH_PUBLICATION_CATALOG))
            .toContain('<summary>Request interpreted from und</summary>');
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
            expect(renderTranslationContext(result!, ENGLISH_PUBLICATION_CATALOG))
                .toContain('<summary>Request interpreted from es-ES</summary>');
        } finally {
            displayNames.mockRestore();
        }
    });

    it('uses the canonical source tag when the display-name service returns no label', () => {
        const of = jest.spyOn(Intl.DisplayNames.prototype, 'of').mockReturnValue(undefined);
        try {
            const result = composeTranslatedComment('translated', 'original', {
                sourceLocale: 'es-ES',
                targetLocale: 'en-US',
            });
            expect(renderTranslationContext(result!, ENGLISH_PUBLICATION_CATALOG))
                .toContain('<summary>Request interpreted from es-ES</summary>');
        } finally {
            of.mockRestore();
        }
    });
});
