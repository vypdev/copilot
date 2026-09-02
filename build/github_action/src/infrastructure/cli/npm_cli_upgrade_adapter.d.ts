import type { CliUpgradePort } from '../../application/ports/cli_upgrade_ports';
export declare const COPILOT_PACKAGE_NAME = "@vypdev/copilot";
export declare function resolveNpmExecutable(platform?: NodeJS.Platform): string;
/** Executes the npm installation without invoking a shell or interpolating user input. */
export declare class NpmCliUpgradeAdapter implements CliUpgradePort {
    upgrade(): Promise<void>;
}
