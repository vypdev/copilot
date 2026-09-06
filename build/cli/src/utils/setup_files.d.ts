import type { SetupFeatures, SetupWorkflowComparison } from '../domain/setup';
/**
 * Ensure .github, .github/workflows and .github/ISSUE_TEMPLATE exist; create them if missing.
 * @param cwd - Directory (repo root)
 */
export declare function ensureGitHubDirs(cwd: string): void;
/**
 * Copy setup files from setup/ to repo (.github/ workflows, ISSUE_TEMPLATE, and pull_request_template.md).
 * Skips files that already exist at destination (no overwrite).
 * Logs each file copied or skipped. No-op if setup/ does not exist.
 * By default setup dir is the copilot package root (not cwd), so it works when running from another repo.
 * @param cwd - Repo root (destination)
 * @param setupDirOverride - Optional path to setup/ folder (for tests). If not set, uses package root.
 * @returns { copied, skipped }
 */
export declare function copySetupFiles(cwd: string, setupDirOverride?: string, features?: SetupFeatures, options?: {
    updateExistingWorkflows?: boolean;
    approvedWorkflowFiles?: readonly string[];
}): {
    copied: number;
    skipped: number;
};
export declare function compareSetupWorkflows(cwd: string, features?: SetupFeatures, setupDirOverride?: string): SetupWorkflowComparison[];
/**
 * Resolves the PERSONAL_ACCESS_TOKEN for setup from a single priority order:
 * 1. override (e.g. CLI --token) if provided and valid,
 * 2. process.env.PERSONAL_ACCESS_TOKEN.
 * Returns undefined if no valid token is found.
 */
export declare function getSetupToken(_cwd: string, override?: string): string | undefined;
/**
 * Returns true if a valid setup token is available (same resolution order as getSetupToken).
 * Pass an optional override (e.g. CLI --token) so validation considers all sources consistently.
 */
export declare function hasValidSetupToken(cwd: string, override?: string): boolean;
