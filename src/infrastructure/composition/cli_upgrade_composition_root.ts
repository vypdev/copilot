import type { CliUpgradePort } from '../../application/ports/cli_upgrade_ports';
import { UpgradeCliUseCase } from '../../application/usecases/upgrade_cli_use_case';
import { PnpmCliUpgradeAdapter } from '../cli/pnpm_cli_upgrade_adapter';

export function createUpgradeCliUseCase(
    cliUpgradePort: CliUpgradePort = new PnpmCliUpgradeAdapter(),
): UpgradeCliUseCase {
    return new UpgradeCliUseCase(cliUpgradePort);
}
