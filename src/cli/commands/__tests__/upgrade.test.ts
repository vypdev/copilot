import { Command } from 'commander';
import { registerUpgradeCommand, runUpgradeCommand } from '../upgrade';
import { ApplicationError } from '../../../application/errors/application_error';
import type { CliUpgradeResult } from '../../../application/ports/cli_upgrade_ports';
import * as composition from '../../../infrastructure/composition/cli_upgrade_composition_root';
import { UpgradeCliUseCase } from '../../../application/usecases/upgrade_cli_use_case';

describe('upgrade command adapter', () => {
    it('registers the upgrade command with package-specific help', () => {
        const program = new Command();
        registerUpgradeCommand(program);

        const command = program.commands.find((candidate) => candidate.name() === 'upgrade');

        expect(command).toBeDefined();
        expect(command?.description()).toContain('@vypdev/copilot');
    });

    it('reports a successful upgrade', async () => {
        const runner = { execute: jest.fn().mockResolvedValue({ version: '3.7.0', packageManager: 'npm', executablePath: '/npm/bin/copilot' }) };
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        await runUpgradeCommand(runner);

        expect(runner.execute).toHaveBeenCalledTimes(1);
        expect(logSpy).toHaveBeenCalledWith('✅ Copilot 3.7.0 was upgraded successfully via npm. "copilot --version" verified.');
        logSpy.mockRestore();
    });

    it('routes the parsed command through the default composition and verified result', async () => {
        const upgrade = jest.fn().mockResolvedValue({ version: '3.7.0', packageManager: 'npm', executablePath: '/npm/bin/copilot' });
        const factory = jest.spyOn(composition, 'createUpgradeCliUseCase').mockReturnValue(new UpgradeCliUseCase({ upgrade }));
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const program = new Command();
            registerUpgradeCommand(program);
            await program.parseAsync(['node', 'copilot', 'upgrade']);
            expect(upgrade).toHaveBeenCalledTimes(1);
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"copilot --version" verified.'));
        } finally {
            factory.mockRestore();
            logSpy.mockRestore();
        }
    });

    it('does not announce success while effective-version verification is pending', async () => {
        let finish!: (result: CliUpgradeResult) => void;
        const runner = { execute: () => new Promise<CliUpgradeResult>((resolve) => { finish = resolve; }) };
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const pending = runUpgradeCommand(runner);
            expect(logSpy.mock.calls.flat().join(' ')).not.toContain('successfully');
            finish({ version: '3.7.0', packageManager: 'pnpm', executablePath: '/pnpm/copilot' });
            await pending;
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('successfully via pnpm'));
        } finally {
            logSpy.mockRestore();
        }
    });

    it('keeps verification failure actionable and never announces success', async () => {
        const runner = { execute: jest.fn().mockRejectedValue(new ApplicationError('workflow.failed', 'Check "copilot --version" and PATH. The installation may already be updated.')) };
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const previousExitCode = process.exitCode;
        try {
            await runUpgradeCommand(runner);
            expect(process.exitCode).toBe(1);
            expect(logSpy.mock.calls.flat().join(' ')).not.toContain('successfully');
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Check "copilot --version" and PATH.'));
        } finally {
            process.exitCode = previousExitCode;
            logSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('sets a failure exit code when the upgrade fails', async () => {
        const runner = { execute: jest.fn().mockRejectedValue(new Error('pnpm failed')) };
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const previousExitCode = process.exitCode;
        process.exitCode = undefined;

        await runUpgradeCommand(runner);

        expect(process.exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to upgrade Copilot. Reference:'));
        expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('pnpm failed');
        process.exitCode = previousExitCode;
        errorSpy.mockRestore();
    });
});
