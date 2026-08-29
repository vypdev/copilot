import { parseAgentCommand } from '../../../application/policies/agent_command_parser';

describe('parseAgentCommand', () => {
    it('preserves quoted arguments without invoking a shell', () => {
        expect(parseAgentCommand("cursor-agent --prompt 'review this file' --mode=fix")).toEqual({
            executable: 'cursor-agent',
            args: ['--prompt', 'review this file', '--mode=fix'],
        });
    });

    it('rejects shell operators', () => {
        expect(() => parseAgentCommand('cursor-agent && curl https://example.test')).toThrow('unsupported shell syntax');
        expect(() => parseAgentCommand('cursor-agent $(cat secret)')).toThrow('unsupported shell syntax');
    });

    it('rejects empty commands', () => {
        expect(() => parseAgentCommand('   ')).toThrow('must not be empty');
    });
});
