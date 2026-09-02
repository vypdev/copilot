import { Command } from 'commander';
import { createUpgradeCliUseCase } from '../../infrastructure/composition/cli_upgrade_composition_root';

export interface UpgradeCommandRunner {
    execute(): Promise<void>;
}

export async function runUpgradeCommand(
    runner: UpgradeCommandRunner = createUpgradeCliUseCase(),
): Promise<void> {
    console.log('⬆️ Updating the global @vypdev/copilot installation...');
    try {
        await runner.execute();
        console.log('✅ Copilot was upgraded successfully. Run "copilot --version" to verify.');
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ Unable to upgrade Copilot: ${message}`);
        process.exitCode = 1;
    }
}

export function registerUpgradeCommand(program: Command): void {
    program
        .command('upgrade')
        .description('Upgrade the global @vypdev/copilot installation to the latest published version')
        .action(() => runUpgradeCommand());
}
