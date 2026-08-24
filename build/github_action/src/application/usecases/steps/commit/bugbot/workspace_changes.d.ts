import type { GitCommitPort } from '../../../../ports/git_ports';
/**
 * Extracts repository-relative paths from `git status --porcelain` output.
 * Renames are represented by their destination path because that is what will
 * be staged by the automated commit.
 */
export declare function parsePorcelainWorkspacePaths(status: string): string[];
/** Returns true for files that must never be included in an automated commit. */
export declare function isSensitiveWorkspacePath(path: string): boolean;
/**
 * Selects paths introduced by the AI operation and removes sensitive paths.
 * The order from the post-operation status is preserved for deterministic git calls.
 */
export declare function selectWorkspacePathsToCommit(before: string[], after: string[]): string[];
/** Reads the current working tree paths without executing a shell. */
export declare function listWorkspacePaths(gitCommitPort: GitCommitPort): Promise<string[]>;
export declare function hasWorkspaceChanges(gitCommitPort: GitCommitPort): Promise<boolean>;
