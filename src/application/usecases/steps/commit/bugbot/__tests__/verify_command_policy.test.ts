import {
    MAX_VERIFY_COMMANDS,
    limitVerifyCommands,
    parseVerifyCommand,
} from '../verify_command_policy';

describe('verify command policy', () => {
    it('parses quoted arguments without invoking a shell', () => {
        expect(parseVerifyCommand('pnpm run "test with spaces"')).toEqual({
            program: 'pnpm',
            args: ['run', 'test with spaces'],
        });
    });

    it('rejects shell operators and empty commands', () => {
        expect(parseVerifyCommand('pnpm test && rm -rf /')).toBeNull();
        expect(parseVerifyCommand('   ')).toBeNull();
    });

    it('keeps only string commands and enforces the command limit', () => {
        const commands = Array.from({ length: MAX_VERIFY_COMMANDS + 2 }, (_, index) =>
            index === 1 ? 42 : `pnpm test:${index}`
        );

        expect(limitVerifyCommands(commands)).toHaveLength(MAX_VERIFY_COMMANDS);
        expect(limitVerifyCommands(commands)).not.toContain(42);
    });
});
