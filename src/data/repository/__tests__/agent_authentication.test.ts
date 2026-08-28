import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAgentAuthentication } from '../agent_authentication';

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
