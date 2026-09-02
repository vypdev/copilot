import type { CliUpgradePort } from '../../application/ports/cli_upgrade_ports';
import { UpgradeCliUseCase } from '../../application/usecases/upgrade_cli_use_case';
export declare function createUpgradeCliUseCase(cliUpgradePort?: CliUpgradePort): UpgradeCliUseCase;
