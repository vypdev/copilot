import { runVerifyCommands } from '../verify_command_runner';
import { VerificationPrerequisiteError } from '../../../../../policies/verification_runtime_policy';

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
        expect(result).toEqual({ success: false, failedCommand: 'pnpm test', failure: {stage: 'command', reason: 'command-failed', command: 'configured-command', commandIndex: 1} });

        const error = await runVerifyCommands(['pnpm test'], async () => {
            throw new Error('runner unavailable');
        });
        expect(error).toEqual({ success: false, failedCommand: 'pnpm test', failure: {stage: 'command', reason: 'command-failed', command: 'configured-command', commandIndex: 1} });
    });

    it('redacts sensitive command arguments from diagnostics while preserving execution arguments', async () => {
        const execute = jest.fn().mockResolvedValue(1);
        const result = await runVerifyCommands(['pnpm test --token top-secret'], execute);

        expect(execute).toHaveBeenCalledWith('pnpm', ['test', '--token', 'top-secret']);
        expect(result).toEqual({ success: false, failedCommand: 'pnpm test --token [REDACTED]', failure: {stage: 'command', reason: 'command-failed', command: 'configured-command', commandIndex: 1} });
    });

    it('does not echo invalid command text into the returned error', async () => {
        const result = await runVerifyCommands(['pnpm test; echo top-secret'], jest.fn());

        expect(result).toEqual({
            success: false,
            error: 'Invalid verify command (use no shell operators; quotes allowed).',
            failure: {stage: 'command', reason: 'command-invalid', command: 'configured-command', commandIndex: 1},
        });
        expect(JSON.stringify(result)).not.toContain('top-secret');
    });

    it('reports bounded prerequisite recovery and stops the remaining verification commands', async () => {
        const execute = jest.fn().mockRejectedValue(new VerificationPrerequisiteError('unavailable', { runtime: 'java', version: '17' }, undefined, 'copilot-issues'));
        const result = await runVerifyCommands(['make ci-local --token top-secret', 'pnpm test'], execute);
        expect(result).toMatchObject({ success: false, failedCommand: 'make ci-local --token [REDACTED]' });
        expect(result.error).toContain('Java 17 is unavailable');
        expect(result.error).toContain('job copilot-issues');
        expect(result.error).toContain('same job before Copilot');
        expect(result.error).toContain('#repository-verification-prerequisites');
        expect(JSON.stringify(result)).not.toContain('top-secret');
        expect(execute).toHaveBeenCalledTimes(1);
    });
});
