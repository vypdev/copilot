import { isNewerCliVersion } from '../../domain/cli_version';
import type { CliUpdateCheckPort } from '../ports/cli_update_check_ports';

export interface CliUpdateAvailable {
    installedVersion: string;
    publishedVersion: string;
}

/** Checks for a newer published CLI version without coupling the application to npm. */
export class CheckCliUpdateUseCase {
    constructor(private readonly cliUpdateCheckPort: CliUpdateCheckPort) {}

    async execute(installedVersion: string): Promise<CliUpdateAvailable | undefined> {
        const publishedVersion = await this.cliUpdateCheckPort.getLatestPublishedVersion();
        if (!publishedVersion || !isNewerCliVersion(installedVersion, publishedVersion)) return undefined;

        return { installedVersion, publishedVersion };
    }
}
