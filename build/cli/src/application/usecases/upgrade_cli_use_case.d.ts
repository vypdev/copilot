import type { CliUpgradePort } from '../ports/cli_upgrade_ports';
/** Coordinates a CLI upgrade without coupling application behavior to npm. */
export declare class UpgradeCliUseCase {
    private readonly cliUpgradePort;
    constructor(cliUpgradePort: CliUpgradePort);
    execute(): Promise<void>;
}
