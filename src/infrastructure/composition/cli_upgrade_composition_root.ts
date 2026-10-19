import type { CliUpgradePort } from '../../application/ports/cli_upgrade_ports';
import { UpgradeCliUseCase } from '../../application/usecases/upgrade_cli_use_case';
import { ActiveCliUpgradeAdapter } from '../cli/active_cli_upgrade_adapter';

export function createUpgradeCliUseCase(
    cliUpgradePort: CliUpgradePort = new ActiveCliUpgradeAdapter(),
): UpgradeCliUseCase {
    return new UpgradeCliUseCase(cliUpgradePort);
}
