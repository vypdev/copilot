/**
 * Path validation for AI-returned finding.file to prevent path traversal and misuse.
 * Rejects paths containing '..', null bytes, or absolute paths.
 */

const NULL_BYTE = '\0';
const PARENT_SEGMENT = '..';
const SLASH = '/';
const BACKSLASH = '\\';

/**
 * Returns true if the path is safe to use: no '..', no null bytes, not absolute.
 * Does not check against a list of allowed files; use isAllowedPathForPr for that.
 */
export function isSafeFindingFilePath(path: string | undefined): boolean {
    if (path == null || typeof path !== 'string') return false;
    const trimmed = path.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.includes(NULL_BYTE)) return false;
    if (trimmed.includes(PARENT_SEGMENT)) return false;
    if (trimmed.startsWith(SLASH)) return false;
    if (/^[a-zA-Z]:[/\\]/.test(trimmed)) return false;
    if (trimmed.startsWith(BACKSLASH)) return false;
    return true;
}

/**
 * Returns true if path is safe (isSafeFindingFilePath) and is in the list of PR changed files.
 * Used to validate finding.file before using it for PR review comments.
 */
export function isAllowedPathForPr(
    path: string | undefined,
    prFiles: Array<{ filename: string }>
): boolean {
    if (!isSafeFindingFilePath(path)) return false;
    if (prFiles.length === 0) return false;
    const normalized = path!.trim();
    return prFiles.some((f) => f.filename === normalized);
}

/**
 * Resolves the file path to use for a PR review comment: finding.file if valid and in prFiles.
 * Returns undefined when the finding's file is not in the PR so we do not attach the comment
 * to the wrong file (e.g. the first file in the list).
 */
export function resolveFindingPathForPr(
    findingFile: string | undefined,
    prFiles: Array<{ filename: string; status: string }>
): string | undefined {
    if (prFiles.length === 0) return undefined;
    if (isAllowedPathForPr(findingFile, prFiles)) return findingFile!.trim();
    return undefined;
}
