/** Retrieves the latest published version of the Copilot CLI. */
export interface CliUpdateCheckPort {
    getLatestPublishedVersion(): Promise<string | undefined>;
}
