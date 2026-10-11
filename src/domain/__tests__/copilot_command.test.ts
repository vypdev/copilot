import { copilotCommandAcceptsAdaptableProse, parseCopilotCommand } from '../copilot_command';

describe('Copilot command policy', () => {
    it('classifies only commands with natural-language arguments as adaptable prose', () => {
        expect(copilotCommandAcceptsAdaptableProse('fix')).toBe(false);
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
    it.each(['dismiss', 'fix'])('preserves one quoted finding identifier containing spaces for %s', command => {
        const id = 'docs/issues/first-workflow.mdx:28:awaiting-maintainer treated as failure';
        expect(parseCopilotCommand(`/copilot ${command} ${JSON.stringify(id)}`)).toMatchObject({
            kind: 'command', command: { name: command, arguments: [id] },
        });
    });

    it.each(['dismiss', 'fix'])('supports mixed plain and quoted finding IDs as separate exact operands for %s', command => {
        expect(parseCopilotCommand(`/copilot ${command} plain-id "second spaced id"`)).toMatchObject({
            kind: 'command', command: { arguments: ['plain-id', 'second spaced id'] },
        });
    });

    it.each(['dismiss', 'fix'])('preserves escaped backslashes, Unicode and significant internal spaces for %s', command => {
        const id = 'src/área\\file.ts:8:two  words';
        expect(parseCopilotCommand(`/copilot ${command} ${JSON.stringify(id)}`)).toMatchObject({
            kind: 'command', command: { arguments: [id] },
        });
    });

    it.each(['dismiss', 'fix'])('accepts twenty quoted identifiers without counting their internal spaces for %s', command => {
        const ids = Array.from({ length: 20 }, (_, index) => `id ${index}`);
        expect(parseCopilotCommand(`/copilot ${command} ${ids.map(id => JSON.stringify(id)).join(' ')}`)).toMatchObject({
            kind: 'command', command: { arguments: ids },
        });
    });

    it.each(['dismiss', 'fix'])('rejects twenty-one quoted identifiers under the unchanged argument bound for %s', command => {
        const ids = Array.from({ length: 21 }, (_, index) => `id ${index}`);
        expect(parseCopilotCommand(`/copilot ${command} ${ids.map(id => JSON.stringify(id)).join(' ')}`)).toMatchObject({ kind: 'invalid' });
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
    ].flatMap(operand => ['dismiss', 'fix'].map(command => ({ command, operand }))))('rejects malformed or empty $command finding operand $operand', ({ command, operand }) => {
        expect(parseCopilotCommand(`/copilot ${command} ${operand}`)).toMatchObject({ kind: 'invalid' });
    });

});
