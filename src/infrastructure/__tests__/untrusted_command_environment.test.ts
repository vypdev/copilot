import { existsSync } from 'node:fs';
import { prepareUntrustedCommandEnvironment } from '../untrusted_command_environment';

describe('prepareUntrustedCommandEnvironment', () => {
    it('keeps only runtime metadata and removes every credential/auth-store reference', () => {
        const runtime = prepareUntrustedCommandEnvironment({
            PATH: '/usr/bin',
            CI: 'true',
            GITHUB_WORKSPACE: '/workspace',
            GITHUB_TOKEN: 'github-secret',
            PAT: 'pat-secret',
            OPENAI_API_KEY: 'openai-secret',
            CODEX_ACCESS_TOKEN: 'codex-secret',
            CODEX_HOME: '/sensitive/codex-home',
            OPENCODE_AUTH_FILE: '/sensitive/opencode-auth.json',
            AWS_SECRET_ACCESS_KEY: 'cloud-secret',
        });
        try {
            expect(runtime.environment).toMatchObject({
                PATH: '/usr/bin',
                CI: 'true',
                GITHUB_WORKSPACE: '/workspace',
            });
            expect(runtime.environment.HOME).toContain('copilot-verify-runtime-');
            expect(JSON.stringify(runtime.environment)).not.toContain('secret');
            expect(runtime.environment).not.toHaveProperty('CODEX_HOME');
            expect(runtime.environment).not.toHaveProperty('OPENCODE_AUTH_FILE');
        } finally {
            const home = runtime.environment.HOME;
            runtime.cleanup();
            expect(existsSync(home)).toBe(false);
        }
    });
});
