import { parseCopilotCommand } from '../copilot_command';

describe('Copilot command policy', () => {
    it.each([
        ['/copilot plan', 'plan'],
        ['/copilot help', 'help'],
        ['/copilot analyze', 'analyze'],
        ['/copilot explain src/auth/login.ts', 'explain'],
        ['/copilot diagnose', 'diagnose'],
        ['/copilot implement add a regression test', 'implement'],
        ['/copilot review security regression', 'review'],
        ['/copilot status', 'status'],
        ['/copilot description', 'description'],
        ['/copilot fix FINDING-1 FINDING-2', 'fix'],
    ])('parses %s as an explicit command', (input, name) => {
        const result = parseCopilotCommand(input);
        expect(result.kind).toBe('command');
        if (result.kind === 'command') expect(result.command.name).toBe(name);
    });

    it('does not classify ordinary content as a command', () => {
        expect(parseCopilotCommand('Please /copilot plan this')).toEqual({ kind: 'none' });
    });

    it('rejects unknown commands and missing required arguments', () => {
        expect(parseCopilotCommand('/copilot deploy')).toMatchObject({ kind: 'invalid' });
        expect(parseCopilotCommand('/copilot fix')).toMatchObject({ kind: 'invalid' });
        expect(parseCopilotCommand('/copilot implement')).toMatchObject({ kind: 'invalid' });
    });


    it('rejects oversized command input before tokenization', () => {
        expect(parseCopilotCommand(`/copilot plan ${'x'.repeat(2_000)}`)).toMatchObject({ kind: 'invalid' });
    });
});
