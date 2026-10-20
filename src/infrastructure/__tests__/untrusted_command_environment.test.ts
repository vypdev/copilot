import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { prepareUntrustedCommandEnvironment } from '../untrusted_command_environment';

describe('prepareUntrustedCommandEnvironment', () => {
    it('keeps nested temporary work inside the isolated profile and removes it with that profile', () => {
        const runtime = prepareUntrustedCommandEnvironment({ TMP: 'host-temp', TEMP: 'host-temp', TMPDIR: 'host-temp', RUNNER_TEMP: 'host-runner' });
        const home = runtime.environment.HOME;
        for (const key of ['TMP', 'TEMP', 'TMPDIR', 'RUNNER_TEMP']) expect(runtime.environment[key]).toBe(join(home, 'temp'));
        expect(existsSync(runtime.environment.TEMP)).toBe(true);
        runtime.cleanup();
        expect(existsSync(home)).toBe(false);
    });
    it.each([true, false])('creates private Windows profile and cache paths with host application data present=%s', present => {
        const runtime = prepareUntrustedCommandEnvironment({
            SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', SystemDrive: 'C:',
            COPILOT_JEST_WINDOWS_SERVICE_COVERAGE: '1',
            ...(present ? { APPDATA: 'host-roaming', LOCALAPPDATA: 'host-local', USERPROFILE: 'host-user' } : {}),
            PSModuleAnalysisCachePath: 'host-cache', PAT: 'secret',
        }, 'win32');
        try {
            const environment = runtime.environment;
            expect(environment.SystemDrive).toBe('C:');
            expect(environment.COPILOT_JEST_WINDOWS_SERVICE_COVERAGE).toBe('1');
            expect(environment.USERPROFILE).toBe(environment.HOME);
            expect(existsSync(environment.APPDATA)).toBe(true);
            expect(existsSync(environment.LOCALAPPDATA)).toBe(true);
            expect(environment.PSModuleAnalysisCachePath).toContain(environment.LOCALAPPDATA);
            expect(JSON.stringify(environment)).not.toMatch(/host-|secret/);
        } finally {
            const root = runtime.environment.HOME;
            runtime.cleanup();
            expect(existsSync(root)).toBe(false);
        }
    });
    it('keeps only runtime metadata and removes every credential/auth-store reference', () => {
        const runtime = prepareUntrustedCommandEnvironment({
            PATH: '/usr/bin',
            JAVA_HOME: '/tools/jdk-17',
            JAVA_TOOL_OPTIONS: '-Dpassword=secret',
            JDK_JAVA_OPTIONS: '-Dpassword=secret',
            GRADLE_USER_HOME: '/sensitive/gradle',
            MAVEN_OPTS: '-Dpassword=secret',
            NODE_OPTIONS: '--require /sensitive/loader.js',
            CI: 'true',
            GITHUB_WORKSPACE: '/workspace',
            OS: 'Windows_NT',
            WINDIR: 'C:\\Windows',
            GITHUB_TOKEN: 'github-secret',
            PAT: 'pat-secret',
            OPENAI_API_KEY: 'openai-secret',
            CODEX_API_KEY: 'codex-secret',
            CODEX_HOME: '/sensitive/codex-home',
            OPENCODE_AUTH_FILE: '/sensitive/opencode-auth.json',
            AWS_SECRET_ACCESS_KEY: 'cloud-secret',
        });
        try {
            expect(runtime.environment).toMatchObject({
                PATH: '/usr/bin',
                JAVA_HOME: '/tools/jdk-17',
                CI: 'true',
                GITHUB_WORKSPACE: '/workspace',
                OS: 'Windows_NT',
                WINDIR: 'C:\\Windows',
            });
            expect(runtime.environment.HOME).toContain('copilot-verify-runtime-');
            expect(JSON.stringify(runtime.environment)).not.toContain('secret');
            expect(runtime.environment).not.toHaveProperty('CODEX_HOME');
            expect(runtime.environment).not.toHaveProperty('OPENCODE_AUTH_FILE');
            for (const key of ['JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', 'GRADLE_USER_HOME', 'MAVEN_OPTS', 'NODE_OPTIONS']) {
                expect(runtime.environment).not.toHaveProperty(key);
            }
        } finally {
            const home = runtime.environment.HOME;
            runtime.cleanup();
            expect(existsSync(home)).toBe(false);
        }
    });
});
