/**
 * Sanitizes user-provided comment text before inserting into an AI prompt.
 * Prevents prompt injection by neutralizing sequences that could break out of
 * delimiters (e.g. triple quotes) or be interpreted as instructions.
 */

const MAX_USER_COMMENT_LENGTH = 4000;
const TRUNCATION_SUFFIX = "\n[... truncated]";

/**
 * Sanitize a user comment for safe inclusion in a prompt.
 * - Trims whitespace.
 * - Escapes backslashes so triple-quote cannot be smuggled via \"""
 * - Replaces """ with "" so the comment cannot close a triple-quoted block.
 * - Truncates to a maximum length. When truncating, removes trailing backslashes
 *   until there is an even number so we never split an escape sequence (no lone \ at the end).
 */
export function sanitizeUserCommentForPrompt(raw: string): string {
    if (typeof raw !== "string") return "";
    let s = raw.trim();
    s = s.replace(/\\/g, "\\\\");
    s = s.replace(/"""/g, '""');
    if (s.length > MAX_USER_COMMENT_LENGTH) {
        s = s.slice(0, MAX_USER_COMMENT_LENGTH);
        // Do not leave an odd number of trailing backslashes (would break escape sequence or escape the suffix).
        let trailingBackslashCount = 0;
        while (trailingBackslashCount < s.length && s[s.length - 1 - trailingBackslashCount] === "\\") {
            trailingBackslashCount++;
        }
        if (trailingBackslashCount % 2 === 1) {
            s = s.slice(0, -1);
        }
        s = s + TRUNCATION_SUFFIX;
    }
    return s;
}
