import type { CliUpgradePort } from '../../application/ports/cli_upgrade_ports';
export declare function resolvePnpmExecutable(platform?: NodeJS.Platform): string;
/** Executes the pnpm installation without invoking a shell or interpolating user input. */
export declare class PnpmCliUpgradeAdapter implements CliUpgradePort {
    upgrade(): Promise<void>;
}
