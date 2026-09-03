import type { CliUpdateAvailable } from '../application/usecases/check_cli_update_use_case';

export interface CliUpdateChecker {
    execute(installedVersion: string): Promise<CliUpdateAvailable | undefined>;
}

/** Displays advisory update information while keeping update failures invisible to users. */
export async function notifyAboutCliUpdate(
    checker: CliUpdateChecker,
    installedVersion: string,
    output: Pick<typeof console, 'log'> = console,
): Promise<void> {
    try {
        const update = await checker.execute(installedVersion);
        if (update) {
            output.log(`A new version (${update.publishedVersion}) is available. Run "copilot upgrade".`);
        }
    } catch {
        // Version checks are advisory and must never change the command outcome.
    }
}
