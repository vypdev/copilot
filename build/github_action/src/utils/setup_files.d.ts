/**
 * Ensure .github, .github/workflows and .github/ISSUE_TEMPLATE exist; create them if missing.
 * @param cwd - Directory (repo root)
 */
export declare function ensureGitHubDirs(cwd: string): void;
/**
 * Copy setup files from setup/ to repo (.github/ workflows, ISSUE_TEMPLATE, pull_request_template.md, .env at root).
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
 * Returns the PERSONAL_ACCESS_TOKEN to use for setup (from environment or .env in cwd).
 * Same resolution order as hasValidSetupToken; returns undefined if no valid token is found.
 */
export declare function getSetupToken(cwd: string): string | undefined;
/**
 * Returns true if PERSONAL_ACCESS_TOKEN is available and looks like a real token
 * (from environment or .env), not the placeholder. Setup should only continue when this is true.
 */
export declare function hasValidSetupToken(cwd: string): boolean;
/** Returns true if a .env file exists in the given directory. */
export declare function setupEnvFileExists(cwd: string): boolean;
