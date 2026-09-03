import type { CliUpdateAvailable } from '../application/usecases/check_cli_update_use_case';
export interface CliUpdateChecker {
    execute(installedVersion: string): Promise<CliUpdateAvailable | undefined>;
}
/** Displays advisory update information while keeping update failures invisible to users. */
export declare function notifyAboutCliUpdate(checker: CliUpdateChecker, installedVersion: string, output?: Pick<typeof console, 'log'>): Promise<void>;
