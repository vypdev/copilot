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
});
