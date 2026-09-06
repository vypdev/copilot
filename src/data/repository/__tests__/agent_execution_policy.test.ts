import { enforceAgentExecutionPolicy } from '../agent_execution_policy';

describe('enforceAgentExecutionPolicy', () => {
    it('forces non-mutating Codex capabilities into a read-only sandbox', () => {
        expect(enforceAgentExecutionPolicy('codex', 'reviewer', ['exec', '--model', 'gpt-5', '-'])).toEqual([
            'exec', '--model', 'gpt-5', '--sandbox', 'read-only', '--ignore-user-config', '-',
        ]);
    });

    it('allows only workspace writes for the fixer capability', () => {
        expect(enforceAgentExecutionPolicy('codex', 'fixer', ['exec', '--model', 'gpt-5', '-'])).toEqual([
            'exec', '--model', 'gpt-5', '--sandbox', 'workspace-write', '--ignore-user-config', '-',
        ]);
    });

    it('rejects mismatched and bypassed sandbox policies', () => {
        expect(() => enforceAgentExecutionPolicy('codex', 'reviewer', ['exec', '--sandbox', 'workspace-write', '-']))
            .toThrow('requires the read-only sandbox');
        expect(() => enforceAgentExecutionPolicy('codex', 'fixer', ['exec', '--dangerously-bypass-approvals-and-sandbox', '-']))
            .toThrow('bypass flags are not allowed');
    });

    it('does not invent unsupported controls for other providers', () => {
        expect(enforceAgentExecutionPolicy('cursor', 'reviewer', ['-p'])).toEqual(['-p']);
    });
});
