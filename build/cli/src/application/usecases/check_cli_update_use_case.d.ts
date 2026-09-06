import type { CliUpdateCheckPort } from '../ports/cli_update_check_ports';
export interface CliUpdateAvailable {
    installedVersion: string;
    publishedVersion: string;
}
/** Checks for a newer published CLI version without coupling the application to npm. */
export declare class CheckCliUpdateUseCase {
    private readonly cliUpdateCheckPort;
    constructor(cliUpdateCheckPort: CliUpdateCheckPort);
    execute(installedVersion: string): Promise<CliUpdateAvailable | undefined>;
}
