import { Command } from 'commander';
import { createUpgradeCliUseCase } from '../../infrastructure/composition/cli_upgrade_composition_root';
import { toApplicationError } from '../../application/errors/application_error';
import type { CliUpgradeResult } from '../../application/ports/cli_upgrade_ports';

export interface UpgradeCommandRunner {
    execute(): Promise<CliUpgradeResult>;
}

export async function runUpgradeCommand(
    runner: UpgradeCommandRunner = createUpgradeCliUseCase(),
): Promise<void> {
    console.log('⬆️ Updating the active @vypdev/copilot installation and verifying "copilot --version"...');
    try {
        const result = await runner.execute();
        console.log(`✅ Copilot ${result.version} was upgraded successfully via ${result.packageManager}. "copilot --version" verified.`);
    } catch (error: unknown) {
        const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to upgrade Copilot.');
        console.error(`❌ ${semanticError.message} Reference: ${semanticError.correlationId}`);
        process.exitCode = 1;
    }
}

export function registerUpgradeCommand(program: Command): void {
    program
        .command('upgrade')
        .description('Upgrade the active npm or pnpm @vypdev/copilot installation and verify its effective version')
        .action(() => runUpgradeCommand());
}
