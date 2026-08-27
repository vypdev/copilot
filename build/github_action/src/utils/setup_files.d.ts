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
export declare function copySetupFiles(cwd: string, setupDirOverride?: string): {
    copied: number;
    skipped: number;
};
/**
 * Logs the current state of PERSONAL_ACCESS_TOKEN (environment or .env). Does not create .env.
 */
export declare function ensureEnvWithToken(cwd: string): void;
/**
 * Resolves the PERSONAL_ACCESS_TOKEN for setup from a single priority order:
 * 1. override (e.g. CLI --token) if provided and valid,
 * 2. process.env.PERSONAL_ACCESS_TOKEN,
 * 3. .env file in cwd.
 * Returns undefined if no valid token is found.
 */
export declare function getSetupToken(cwd: string, override?: string): string | undefined;
/**
 * Returns true if a valid setup token is available (same resolution order as getSetupToken).
 * Pass an optional override (e.g. CLI --token) so validation considers all sources consistently.
 */
export declare function hasValidSetupToken(cwd: string, override?: string): boolean;
/** Returns true if a .env file exists in the given directory. */
export declare function setupEnvFileExists(cwd: string): boolean;
