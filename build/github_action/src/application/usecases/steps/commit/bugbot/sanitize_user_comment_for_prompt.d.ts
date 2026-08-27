/**
 * Sanitizes user-provided comment text before inserting into an AI prompt.
 * Prevents prompt injection by neutralizing sequences that could break out of
 * delimiters (e.g. triple quotes) or be interpreted as instructions.
 */
/**
 * Sanitize a user comment for safe inclusion in a prompt.
 * - Trims whitespace.
 * - Escapes backslashes so triple-quote cannot be smuggled via \"""
 * - Replaces """ with "" so the comment cannot close a triple-quoted block.
 * - Truncates to a maximum length. When truncating, removes trailing backslashes
 *   until there is an even number so we never split an escape sequence (no lone \ at the end).
 */
export declare function sanitizeUserCommentForPrompt(raw: string): string;
