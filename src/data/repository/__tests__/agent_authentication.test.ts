import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAgentAuthentication } from '../agent_authentication';

describe('checkAgentAuthentication', () => {
    it('requires provider credentials for CLI execution', () => {
        expect(
            checkAgentAuthentication({ provider: 'opencode', model: 'model', command: 'opencode run' }, {})
        ).toMatchObject({ status: 'missing' });
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

    it('does not treat an API-key auth file as a ChatGPT session', () => {
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
            ).status).toBe('missing');
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
