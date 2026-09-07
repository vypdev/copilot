/**
 * Builds one-process GitHub HTTPS authentication without modifying git config,
 * the remote URL, or the environment inherited by an agent subprocess.
 */
export function buildGitAuthenticationEnvironment(
    token: string | undefined,
    environment: NodeJS.ProcessEnv = process.env,
): Record<string, string> | undefined {
    if (!token?.trim()) return undefined;
    const authorization = Buffer.from(`x-access-token:${token}`).toString('base64');
    return {
        ...Object.fromEntries(
            Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined),
        ),
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.extraheader',
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${authorization}`,
    };
}
