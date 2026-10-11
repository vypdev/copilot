import { copilotCommandAcceptsAdaptableProse, parseCopilotCommand } from '../copilot_command';

describe('Copilot command policy', () => {
    it('classifies only commands with natural-language arguments as adaptable prose', () => {
        expect(copilotCommandAcceptsAdaptableProse('fix')).toBe(true);
        expect(copilotCommandAcceptsAdaptableProse('sync-branch')).toBe(false);
        expect(copilotCommandAcceptsAdaptableProse('help')).toBe(false);
    });

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
        ['/copilot sync-branch --dry-run', 'sync-branch'],
    ])('parses %s as an explicit command', (input, name) => {
        const result = parseCopilotCommand(input);
        expect(result.kind).toBe('command');
        if (result.kind === 'command') expect(result.command.name).toBe(name);
    });

    it('does not classify ordinary content as a command', () => {
        expect(parseCopilotCommand('Please /copilot plan this')).toEqual({ kind: 'none' });
    });

    it('rejects unknown commands and missing required arguments', () => {
        expect(parseCopilotCommand('/copilot')).toMatchObject({ kind: 'invalid' });
        expect(parseCopilotCommand('/copilot deploy')).toMatchObject({ kind: 'invalid' });
        expect(parseCopilotCommand('/copilot fix')).toMatchObject({ kind: 'invalid' });
        expect(parseCopilotCommand('/copilot implement')).toMatchObject({ kind: 'invalid' });
    });


    it('rejects oversized command input before tokenization', () => {
        expect(parseCopilotCommand(`/copilot plan ${'x'.repeat(2_000)}`)).toMatchObject({ kind: 'invalid' });
    });
    it('preserves one quoted finding identifier containing spaces', () => {
        const id = 'docs/issues/first-workflow.mdx:28:awaiting-maintainer treated as failure';
        expect(parseCopilotCommand(`/copilot dismiss ${JSON.stringify(id)}`)).toMatchObject({
            kind: 'command', command: { name: 'dismiss', arguments: [id] },
        });
    });

    it('supports mixed plain and quoted finding IDs as separate exact operands', () => {
        expect(parseCopilotCommand('/copilot dismiss plain-id "second spaced id"')).toMatchObject({
            kind: 'command', command: { arguments: ['plain-id', 'second spaced id'] },
        });
    });

    it('preserves escaped backslashes, Unicode and significant internal spaces', () => {
        const id = 'src/área\\file.ts:8:two  words';
        expect(parseCopilotCommand(`/copilot dismiss ${JSON.stringify(id)}`)).toMatchObject({
            kind: 'command', command: { arguments: [id] },
        });
    });

    it('accepts twenty quoted identifiers without counting their internal spaces', () => {
        const ids = Array.from({ length: 20 }, (_, index) => `id ${index}`);
        expect(parseCopilotCommand(`/copilot dismiss ${ids.map(id => JSON.stringify(id)).join(' ')}`)).toMatchObject({
            kind: 'command', command: { arguments: ids },
        });
    });

    it('rejects twenty-one quoted identifiers under the unchanged argument bound', () => {
        const ids = Array.from({ length: 21 }, (_, index) => `id ${index}`);
        expect(parseCopilotCommand(`/copilot dismiss ${ids.map(id => JSON.stringify(id)).join(' ')}`)).toMatchObject({ kind: 'invalid' });
    });

    it.each([
        '"unterminated id',
        '"first""second"',
        'bad"embedded"quote',
        '"bad\\q"',
        '""',
        '"   "',
        '"line\\nnext"',
        'plain-id "',
    ])('rejects malformed or empty finding operand %s', (operand) => {
        expect(parseCopilotCommand(`/copilot dismiss ${operand}`)).toMatchObject({ kind: 'invalid' });
    });

});
