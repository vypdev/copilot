/**
 * Builds one-process GitHub HTTPS authentication without modifying git config,
 * the remote URL, or the environment inherited by an agent subprocess.
 */
export declare function buildGitAuthenticationEnvironment(token: string | undefined, environment?: NodeJS.ProcessEnv): Record<string, string> | undefined;
