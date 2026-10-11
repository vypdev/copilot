import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface PreparedUntrustedCommandEnvironment {
    environment: Record<string, string>;
    cleanup(): void;
}

const ALLOWED_VARIABLES = [
    'PATH',
    'LANG',
    'LANGUAGE',
    'LC_ALL',
    'TERM',
    'COLORTERM',
    'NO_COLOR',
    'FORCE_COLOR',
    'CI',
    'GITHUB_ACTIONS',
    'GITHUB_WORKSPACE',
    'RUNNER_OS',
    'RUNNER_ARCH',
    'RUNNER_TEMP',
    'RUNNER_TOOL_CACHE',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SystemRoot',
    'SystemDrive',
    'WINDIR',
    'OS',
    'ComSpec',
    'PATHEXT',
    'COPILOT_JEST_WINDOWS_SERVICE_COVERAGE',
] as const;

/**
 * Repository verification commands are untrusted process boundaries. They get
 * a fresh home and only non-secret process metadata, never agent/GitHub/cloud
 * credentials or paths to local agent authentication stores.
 */
export function prepareUntrustedCommandEnvironment(
    source: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
): PreparedUntrustedCommandEnvironment {
    const runtimeHome = mkdtempSync(join(tmpdir(), 'copilot-verify-runtime-'));
    const environment: Record<string, string> = { HOME: runtimeHome };
    for (const variable of ALLOWED_VARIABLES) {
        const value = source[variable];
        if (value !== undefined) environment[variable] = value;
    }
    if (platform === 'win32') {
        environment.USERPROFILE = runtimeHome;
        environment.APPDATA = join(runtimeHome, 'roaming');
        environment.LOCALAPPDATA = join(runtimeHome, 'local');
        for (const directory of [environment.APPDATA, environment.LOCALAPPDATA]) mkdirSync(directory, { mode: 0o700 });
        environment.PSModuleAnalysisCachePath = join(environment.LOCALAPPDATA, 'powershell-module-analysis.cache');
    }
    return {
        environment,
        cleanup: () => rmSync(runtimeHome, { recursive: true, force: true }),
    };
}
