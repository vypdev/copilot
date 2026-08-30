import { parseCopilotCommand } from '../copilot_command';

describe('Copilot command policy', () => {
    it.each([
        ['/copilot plan', 'plan'],
        ['/copilot review security regression', 'review'],
        ['/copilot fix FINDING-1 FINDING-2', 'fix'],
    ])('parses %s as an explicit command', (input, name) => {
        const result = parseCopilotCommand(input);
        expect(result.kind).toBe('command');
        if (result.kind === 'command') expect(result.command.name).toBe(name);
    });

    it('does not classify ordinary content as a command', () => {
        expect(parseCopilotCommand('Please /copilot plan this')).toEqual({ kind: 'none' });
    });

    it('rejects unknown commands and missing finding ids', () => {
        expect(parseCopilotCommand('/copilot deploy')).toMatchObject({ kind: 'invalid' });
        expect(parseCopilotCommand('/copilot fix')).toMatchObject({ kind: 'invalid' });
    });

    it('rejects oversized command input before tokenization', () => {
        expect(parseCopilotCommand(`/copilot plan ${'x'.repeat(2_000)}`)).toMatchObject({ kind: 'invalid' });
    });
});

