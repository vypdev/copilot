/**
 * Path validation for AI-returned finding.file to prevent path traversal and misuse.
 * Rejects paths containing '..', null bytes, or absolute paths.
 */
/**
 * Returns true if the path is safe to use: no '..', no null bytes, not absolute.
 * Does not check against a list of allowed files; use isAllowedPathForPr for that.
 */
export declare function isSafeFindingFilePath(path: string | undefined): boolean;
/**
 * Returns true if path is safe (isSafeFindingFilePath) and is in the list of PR changed files.
 * Used to validate finding.file before using it for PR review comments.
 */
export declare function isAllowedPathForPr(path: string | undefined, prFiles: Array<{
    filename: string;
}>): boolean;
/**
 * Resolves the file path to use for a PR review comment: finding.file if valid and in prFiles.
 * Returns undefined when the finding's file is not in the PR so we do not attach the comment
 * to the wrong file (e.g. the first file in the list).
 */
export declare function resolveFindingPathForPr(findingFile: string | undefined, prFiles: Array<{
    filename: string;
    status: string;
}>): string | undefined;
