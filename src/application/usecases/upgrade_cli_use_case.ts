import type { CliUpgradePort, CliUpgradeResult } from '../ports/cli_upgrade_ports';

/** Coordinates a CLI upgrade without coupling application behavior to npm. */
export class UpgradeCliUseCase {
    constructor(private readonly cliUpgradePort: CliUpgradePort) {}

    async execute(): Promise<CliUpgradeResult> {
        return this.cliUpgradePort.upgrade();
    }
}
