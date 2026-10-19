/** Evidence returned only after the active command has been verified. */
export interface CliUpgradeResult {
    readonly version: string;
    readonly packageManager: 'npm' | 'pnpm';
    readonly executablePath: string;
}

/** Upgrades the active installation and verifies the command resolved through PATH. */
export interface CliUpgradePort {
    upgrade(): Promise<CliUpgradeResult>;
}
