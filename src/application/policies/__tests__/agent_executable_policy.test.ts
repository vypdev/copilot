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

    it.each([
        ['codex', 'C:\\agents\\codex.cmd'], ['codex', 'C:\\agents\\codex.exe'],
        ['opencode', 'C:\\agents\\opencode.cmd'], ['cursor', 'C:\\agents\\agent.exe'],
    ] as const)('accepts reviewed Windows absolute selection %s/%s', (provider, executable) => {
        expect(() => validateAgentExecutableSelection({ provider, executable })).not.toThrow();
    });

    it.each(['codex.bat', 'codex.ps1', 'wrapper.cmd', 'codex.cmd --unsafe', 'codex.cmd'])(
        'rejects Windows command shape %s', basename => {
            const executable = basename === 'codex.cmd' ? basename : `C:\\agents\\${basename}`;
            expect(() => validateAgentExecutableSelection({ provider: 'codex', executable }))
                .toThrow('Agent executable');
        },
    );
    it('rejects a Unix absolute Windows shim', () => {
        expect(() => validateAgentExecutableSelection({ provider: 'codex', executable: '/opt/agents/codex.cmd' }))
            .toThrow('Agent executable');
    });
});
