import { runAgentAuthenticationPreflight, resolveAgentAuthenticationPreflightMode } from '../agent_authentication_preflight';

describe('agent authentication preflight', () => {
    const cursor = { provider: 'cursor' as const, transport: 'cli' as const, model: 'cursor', command: 'cursor-agent' };

    it('fails by default when CLI credentials are missing', () => {
        const result = runAgentAuthenticationPreflight(cursor, {});
        expect(result.mode).toBe('required');
        expect(result.shouldFail).toBe(true);
        expect(result.check.variables).toEqual(['CURSOR_API_KEY']);
    });

    it('supports warn and disabled modes without exposing secret values', () => {
        expect(resolveAgentAuthenticationPreflightMode({ AGENT_AUTH_PREFLIGHT: 'warn' })).toBe('warn');
        expect(runAgentAuthenticationPreflight(cursor, { AGENT_AUTH_PREFLIGHT: 'warn' }).shouldFail).toBe(false);
        expect(runAgentAuthenticationPreflight(cursor, { AGENT_AUTH_PREFLIGHT: 'disabled' }).shouldFail).toBe(false);
    });

    it('requires credentials for OpenCode CLI execution', () => {
        const result = runAgentAuthenticationPreflight({ provider: 'opencode', model: 'model', command: 'opencode run' }, {});
        expect(result.check.status).toBe('missing');
        expect(result.shouldFail).toBe(true);
    });
});
