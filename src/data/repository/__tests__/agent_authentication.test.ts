import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAgentCliEnvironment, checkAgentAuthentication } from '../agent_authentication';

describe('checkAgentAuthentication', () => {
    it('requires provider credentials for OpenCode CLI execution', () => {
        expect(
            checkAgentAuthentication({ provider: 'opencode', model: 'model' }, {})
        ).toMatchObject({ status: 'missing' });
    });

    it('requires the selected OpenCode model-provider credential', () => {
        expect(checkAgentAuthentication({ provider: 'opencode', modelProvider: 'anthropic', model: 'claude' }, { OPENAI_API_KEY: 'wrong-provider' }).status).toBe('missing');
        expect(checkAgentAuthentication({ provider: 'opencode', modelProvider: 'anthropic', model: 'claude' }, { ANTHROPIC_API_KEY: 'key' }).status).toBe('available');
    });

    it('does not require credentials for local OpenCode providers', () => {
        expect(checkAgentAuthentication({ provider: 'opencode', modelProvider: 'ollama', model: 'llama3' }, {}).status).toBe('not_required');
    });

    it('delegates unknown OpenCode provider credentials to OpenCode configuration', () => {
        expect(checkAgentAuthentication({ provider: 'opencode', modelProvider: 'custom-cloud', model: 'model' }, {})).toMatchObject({
            status: 'not_required',
            variables: [],
        });
    });

    it('recognizes Cursor API credentials without exposing their value', () => {
        const result = checkAgentAuthentication(
            { provider: 'cursor', model: 'cursor-agent' },
            { CURSOR_API_KEY: 'secret-value' }
        );
        expect(result.status).toBe('available');
        expect(result.message).not.toContain('secret-value');
        expect(result.variables).toEqual(['CURSOR_API_KEY']);
    });

    it('accepts the OpenAI and Codex API key environment variables', () => {
        expect(
            checkAgentAuthentication(
                { provider: 'codex', model: 'gpt-5-codex' },
                { CODEX_API_KEY: 'key' }
            ).status
        ).toBe('available');
        expect(
            checkAgentAuthentication(
                { provider: 'codex', model: 'gpt-5-codex' },
                { OPENAI_API_KEY: 'key' }
            ).status,
        ).toBe('available');
    });

    it('recognizes a local ChatGPT Codex session without exposing token values', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-codex-auth-test-'));
        try {
            writeFileSync(join(directory, 'auth.json'), JSON.stringify({
                auth_mode: 'chatgpt',
                OPENAI_API_KEY: null,
                tokens: { access_token: 'access', refresh_token: 'refresh' },
            }));
            const result = checkAgentAuthentication(
                { provider: 'codex', model: 'gpt-5.6-luna' },
                { CODEX_HOME: directory }
            );
            expect(result.status).toBe('available');
            expect(result.message).toContain('CODEX_HOME/auth.json');
            expect(result.message).not.toContain('access');
            expect(result.message).not.toContain('refresh');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('isolates exported Codex credentials when a local ChatGPT session is available', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-codex-env-test-'));
        try {
            writeFileSync(join(directory, 'auth.json'), JSON.stringify({
                auth_mode: 'chatgpt',
                OPENAI_API_KEY: null,
                tokens: { access_token: 'access', refresh_token: 'refresh' },
            }));
            const environment = {
                CODEX_HOME: directory,
                OPENAI_API_KEY: 'api-key-that-must-not-be-used',
                CODEX_API_KEY: 'codex-key-that-must-not-be-used',
                PATH: '/usr/bin',
            };

            const isolated = buildAgentCliEnvironment('codex', environment);

            expect(isolated).not.toHaveProperty('OPENAI_API_KEY');
            expect(isolated).not.toHaveProperty('CODEX_API_KEY');
            expect(isolated.PATH).toBe('/usr/bin');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('passes only one canonical Codex credential when no local session is available', () => {
        const environment = {
            OPENAI_API_KEY: 'api-key',
            CODEX_API_KEY: 'codex-api-key',
            OPENCODE_API_KEY: 'opencode-key',
            CURSOR_API_KEY: 'cursor-key',
        };
        const isolated = buildAgentCliEnvironment('codex', environment);
        expect(isolated).toEqual({ OPENAI_API_KEY: 'api-key' });
        expect(isolated).not.toHaveProperty('OPENCODE_API_KEY');
        expect(isolated).not.toHaveProperty('CURSOR_API_KEY');
    });

    it('sanitizes credential-shaped variables even when a custom CLI has no provider', () => {
        const isolated = buildAgentCliEnvironment(undefined, {
            CUSTOM_PROVIDER_API_KEY: 'must-not-leak',
            CUSTOM_PROVIDER_ACCESS_TOKEN: 'must-not-leak',
            PATH: '/usr/bin',
        });

        expect(isolated).toEqual({ PATH: '/usr/bin' });
    });

    it('does not inherit GitHub inputs, generic tokens or cloud credentials', () => {
        const isolated = buildAgentCliEnvironment('codex', {
            PATH: '/usr/bin',
            INPUT_TOKEN: 'github-action-token',
            GITHUB_TOKEN: 'github-token',
            COPILOT_EVIDENCE_TOKEN: 'checks-token',
            PAT: 'personal-access-token',
            DATABASE_URL: 'postgres://secret',
            AWS_SESSION_TOKEN: 'aws-token',
            OPENAI_API_KEY: 'selected-provider-key',
            CODEX_API_KEY: 'codex-api-key',
        }, 'openai');

        expect(isolated).toEqual({ PATH: '/usr/bin', OPENAI_API_KEY: 'selected-provider-key' });
    });

    it('passes only the selected runtime credentials to each CLI', () => {
        const environment = {
            OPENAI_API_KEY: 'openai-key',
            OPENCODE_API_KEY: 'opencode-key',
            CURSOR_API_KEY: 'cursor-key',
            CODEX_API_KEY: 'codex-key',
        };

        const openCodeEnvironment = buildAgentCliEnvironment('opencode', environment, 'openai');
        expect(openCodeEnvironment).toEqual({ OPENAI_API_KEY: 'openai-key' });
        expect(openCodeEnvironment).not.toHaveProperty('CURSOR_API_KEY');
        expect(openCodeEnvironment).not.toHaveProperty('CODEX_API_KEY');

        const codexEnvironment = buildAgentCliEnvironment('codex', environment, 'openai');
        expect(codexEnvironment).toEqual({ OPENAI_API_KEY: 'openai-key' });

        const cursorEnvironment = buildAgentCliEnvironment('cursor', environment);
        expect(cursorEnvironment).toMatchObject({ CURSOR_API_KEY: 'cursor-key' });
        expect(cursorEnvironment).not.toHaveProperty('OPENAI_API_KEY');
        expect(cursorEnvironment).not.toHaveProperty('OPENCODE_API_KEY');
        expect(cursorEnvironment).not.toHaveProperty('CODEX_API_KEY');
    });

    it('isolates credentials for custom OpenCode model providers', () => {
        const environment = {
            CUSTOM_CLOUD_API_KEY: 'custom-key',
            OTHER_PROVIDER_API_KEY: 'other-key',
            PATH: '/usr/bin',
        };

        const isolated = buildAgentCliEnvironment('opencode', environment, 'custom-cloud');

        expect(isolated).toMatchObject({ CUSTOM_CLOUD_API_KEY: 'custom-key', PATH: '/usr/bin' });
        expect(isolated).not.toHaveProperty('OTHER_PROVIDER_API_KEY');
    });

    it('recognizes a local OpenCode auth store without exposing its contents', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-opencode-auth-test-'));
        try {
            const authDirectory = join(directory, 'opencode');
            mkdirSync(authDirectory);
            writeFileSync(join(authDirectory, 'auth.json'), JSON.stringify({ anthropic: { type: 'oauth', refresh: 'refresh-token' } }));
            const result = checkAgentAuthentication(
                { provider: 'opencode', modelProvider: 'anthropic', model: 'claude' },
                { XDG_DATA_HOME: directory }
            );
            expect(result.status).toBe('available');
            expect(result.message).not.toContain('refresh-token');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('accepts a preinitialized runner only after an operational Codex login check', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-codex-auth-test-'));
        try {
            writeFileSync(join(directory, 'auth.json'), JSON.stringify({
                auth_mode: 'apikey',
                OPENAI_API_KEY: 'key',
                tokens: { access_token: 'access', refresh_token: 'refresh' },
            }));
            expect(checkAgentAuthentication(
                { provider: 'codex', model: 'model' },
                { CODEX_HOME: directory },
                { hasOperationalCodexLogin: () => true },
            )).toMatchObject({
                status: 'available',
                message: 'Preinitialized Codex CLI login is operational on the runner.',
            });
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('fails closed when Codex has neither credentials nor an operational runner login', () => {
        expect(checkAgentAuthentication(
            { provider: 'codex', model: 'model' },
            {},
            { hasOperationalCodexLogin: () => false },
        ).status).toBe('missing');
    });

    it('reports the accepted variables when credentials are missing', () => {
        const result = checkAgentAuthentication(
            { provider: 'cursor', model: 'cursor-agent' },
            {}
        );
        expect(result).toEqual({
            status: 'missing',
            variables: ['CURSOR_API_KEY'],
            message: 'No local credentials found for cursor. Set one of: CURSOR_API_KEY.',
        });
    });
});
