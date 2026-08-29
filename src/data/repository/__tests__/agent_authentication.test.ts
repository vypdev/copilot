import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAgentCliEnvironment, checkAgentAuthentication } from '../agent_authentication';

describe('checkAgentAuthentication', () => {
    it('requires provider credentials for OpenCode CLI execution', () => {
        expect(
            checkAgentAuthentication({ provider: 'opencode', model: 'model', command: 'opencode run' }, {})
        ).toMatchObject({ status: 'missing' });
    });

    it('requires the selected OpenCode model-provider credential', () => {
        expect(checkAgentAuthentication({ provider: 'opencode', modelProvider: 'anthropic', model: 'claude', command: 'opencode run --model anthropic/claude' }, { OPENAI_API_KEY: 'wrong-provider' }).status).toBe('missing');
        expect(checkAgentAuthentication({ provider: 'opencode', modelProvider: 'anthropic', model: 'claude', command: 'opencode run --model anthropic/claude' }, { ANTHROPIC_API_KEY: 'key' }).status).toBe('available');
    });

    it('does not require credentials for local OpenCode providers', () => {
        expect(checkAgentAuthentication({ provider: 'opencode', modelProvider: 'ollama', model: 'llama3', command: 'opencode run --model ollama/llama3' }, {}).status).toBe('not_required');
    });

    it('delegates unknown OpenCode provider credentials to OpenCode configuration', () => {
        expect(checkAgentAuthentication({ provider: 'opencode', modelProvider: 'custom-cloud', model: 'model', command: 'opencode run --model custom-cloud/model' }, {})).toMatchObject({
            status: 'not_required',
            variables: [],
        });
    });

    it('recognizes Cursor API credentials without exposing their value', () => {
        const result = checkAgentAuthentication(
            { provider: 'cursor', model: 'cursor-agent', command: 'cursor-agent' },
            { CURSOR_API_KEY: 'secret-value' }
        );
        expect(result.status).toBe('available');
        expect(result.message).not.toContain('secret-value');
        expect(result.variables).toEqual(['CURSOR_API_KEY']);
    });

    it('supports Codex access token or OpenAI API key', () => {
        expect(
            checkAgentAuthentication(
                { provider: 'codex', model: 'gpt-5-codex', command: 'codex' },
                { CODEX_ACCESS_TOKEN: 'token' }
            ).status
        ).toBe('available');
        expect(
            checkAgentAuthentication(
                { provider: 'codex', model: 'gpt-5-codex', command: 'codex' },
                { OPENAI_API_KEY: 'key' }
            ).status
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
                { provider: 'codex', model: 'gpt-5.6-luna', command: 'codex exec' },
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
                CODEX_ACCESS_TOKEN: 'token-that-must-not-be-used',
                PATH: '/usr/bin',
            };

            const isolated = buildAgentCliEnvironment('codex', environment);

            expect(isolated).not.toHaveProperty('OPENAI_API_KEY');
            expect(isolated).not.toHaveProperty('CODEX_ACCESS_TOKEN');
            expect(isolated.PATH).toBe('/usr/bin');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('keeps the Codex API fallback when no local session is available', () => {
        const environment = {
            OPENAI_API_KEY: 'api-key',
            CODEX_ACCESS_TOKEN: 'access-token',
            OPENCODE_API_KEY: 'opencode-key',
            CURSOR_API_KEY: 'cursor-key',
        };
        const isolated = buildAgentCliEnvironment('codex', environment);
        expect(isolated).toMatchObject({ OPENAI_API_KEY: 'api-key', CODEX_ACCESS_TOKEN: 'access-token' });
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

    it('passes only the selected runtime credentials to each CLI', () => {
        const environment = {
            OPENAI_API_KEY: 'openai-key',
            OPENCODE_API_KEY: 'opencode-key',
            CURSOR_API_KEY: 'cursor-key',
            CODEX_ACCESS_TOKEN: 'codex-token',
        };

        const openCodeEnvironment = buildAgentCliEnvironment('opencode', environment, 'openai');
        expect(openCodeEnvironment).toMatchObject({ OPENAI_API_KEY: 'openai-key', OPENCODE_API_KEY: 'opencode-key' });
        expect(openCodeEnvironment).not.toHaveProperty('CURSOR_API_KEY');
        expect(openCodeEnvironment).not.toHaveProperty('CODEX_ACCESS_TOKEN');

        const cursorEnvironment = buildAgentCliEnvironment('cursor', environment);
        expect(cursorEnvironment).toMatchObject({ CURSOR_API_KEY: 'cursor-key' });
        expect(cursorEnvironment).not.toHaveProperty('OPENAI_API_KEY');
        expect(cursorEnvironment).not.toHaveProperty('OPENCODE_API_KEY');
        expect(cursorEnvironment).not.toHaveProperty('CODEX_ACCESS_TOKEN');
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
                { provider: 'opencode', modelProvider: 'anthropic', model: 'claude', command: 'opencode run --model anthropic/claude' },
                { XDG_DATA_HOME: directory }
            );
            expect(result.status).toBe('available');
            expect(result.message).not.toContain('refresh-token');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('allows Codex to defer authentication to a preinitialized runner CLI', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-codex-auth-test-'));
        try {
            writeFileSync(join(directory, 'auth.json'), JSON.stringify({
                auth_mode: 'apikey',
                OPENAI_API_KEY: 'key',
                tokens: { access_token: 'access', refresh_token: 'refresh' },
            }));
            expect(checkAgentAuthentication(
                { provider: 'codex', model: 'model', command: 'codex exec' },
                { CODEX_HOME: directory }
            ).status).toBe('not_required');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('reports the accepted variables when credentials are missing', () => {
        const result = checkAgentAuthentication(
            { provider: 'cursor', model: 'cursor-agent', command: 'cursor-agent' },
            {}
        );
        expect(result).toEqual({
            status: 'missing',
            variables: ['CURSOR_API_KEY'],
            message: 'No local credentials found for cursor. Set one of: CURSOR_API_KEY.',
        });
    });
});
