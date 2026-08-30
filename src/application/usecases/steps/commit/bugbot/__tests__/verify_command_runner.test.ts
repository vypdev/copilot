import { runVerifyCommands } from '../verify_command_runner';

describe('verify command runner', () => {
    it('executes parsed commands sequentially', async () => {
        const calls: string[] = [];
        const result = await runVerifyCommands(['pnpm test', 'pnpm lint'], async (program, args) => {
            calls.push([program, ...args].join(' '));
            return 0;
        });
        expect(result).toEqual({ success: true });
        expect(calls).toEqual(['pnpm test', 'pnpm lint']);
    });

    it('rejects shell operators without invoking the executor', async () => {
        const execute = jest.fn();
        const result = await runVerifyCommands(['pnpm test && rm -rf /'], execute);
        expect(result.success).toBe(false);
        expect(execute).not.toHaveBeenCalled();
    });

    it('returns the failed command and supports executor errors', async () => {
        const result = await runVerifyCommands(['pnpm test'], async () => 1);
        expect(result).toEqual({ success: false, failedCommand: 'pnpm test' });

        const error = await runVerifyCommands(['pnpm test'], async () => {
            throw new Error('runner unavailable');
        });
        expect(error).toEqual({ success: false, failedCommand: 'pnpm test' });
    });

    it('redacts sensitive command arguments from diagnostics while preserving execution arguments', async () => {
        const execute = jest.fn().mockResolvedValue(1);
        const result = await runVerifyCommands(['pnpm test --token top-secret'], execute);

        expect(execute).toHaveBeenCalledWith('pnpm', ['test', '--token', 'top-secret']);
        expect(result).toEqual({ success: false, failedCommand: 'pnpm test --token [REDACTED]' });
    });

    it('does not echo invalid command text into the returned error', async () => {
        const result = await runVerifyCommands(['pnpm test; echo top-secret'], jest.fn());

        expect(result).toEqual({
            success: false,
            error: 'Invalid verify command (use no shell operators; quotes allowed).',
        });
        expect(JSON.stringify(result)).not.toContain('top-secret');
    });
});
