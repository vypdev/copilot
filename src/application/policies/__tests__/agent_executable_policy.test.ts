import { validateAgentExecutableSelection } from '../agent_executable_policy';

describe('agent executable policy', () => {
    it.each([
        ['codex', undefined], ['codex', 'codex'], ['codex', '/opt/agents/codex'],
        ['opencode', 'opencode'], ['cursor', '/opt/agents/agent'],
    ] as const)('accepts the exact %s executable selection %s', (provider, executable) => {
        expect(() => validateAgentExecutableSelection({ provider, executable })).not.toThrow();
    });

    it.each([
        ['codex', 'codex exec'], ['codex', './codex'], ['codex', '/opt/agents/wrapper'],
        ['opencode', 'codex'], ['cursor', 'cursor-agent'], ['cursor', '@args'],
    ] as const)('rejects command or wrapper shape %s/%s', (provider, executable) => {
        expect(() => validateAgentExecutableSelection({ provider, executable })).toThrow('Agent executable');
    });
});
