import { Command } from 'commander';
import { registerUpgradeCommand, runUpgradeCommand } from '../upgrade';

describe('upgrade command adapter', () => {
    it('registers the upgrade command with npm-specific help', () => {
        const program = new Command();
        registerUpgradeCommand(program);

        const command = program.commands.find((candidate) => candidate.name() === 'upgrade');

        expect(command).toBeDefined();
        expect(command?.description()).toContain('@vypdev/copilot');
    });

    it('reports a successful upgrade', async () => {
        const runner = { execute: jest.fn().mockResolvedValue(undefined) };
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        await runUpgradeCommand(runner);

        expect(runner.execute).toHaveBeenCalledTimes(1);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('successfully'));
        logSpy.mockRestore();
    });

    it('sets a failure exit code when the upgrade fails', async () => {
        const runner = { execute: jest.fn().mockRejectedValue(new Error('npm failed')) };
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const previousExitCode = process.exitCode;
        process.exitCode = undefined;

        await runUpgradeCommand(runner);

        expect(process.exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('npm failed'));
        process.exitCode = previousExitCode;
        errorSpy.mockRestore();
    });
});
