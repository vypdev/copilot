/** Opaque marker: it is metadata, not an instruction for another agent. */
export declare const TRANSLATED_COMMENT_MARKER = "<!-- copilot:translated-comment:v2 -->";
export type TranslationPublication = {
    readonly translatedText: string;
    readonly commentBody: string;
};
export declare function hasTranslatedCommentMarker(body: string | null | undefined): boolean;
/**
 * Validates and composes a translation without allowing the model output or
 * quoted source comment to create GitHub mentions, commands, or HTML markers.
 */
export declare function composeTranslatedComment(translatedValue: unknown, originalComment: string): TranslationPublication | undefined;
