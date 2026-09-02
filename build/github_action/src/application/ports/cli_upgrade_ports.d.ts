/** Semantic capability used to upgrade the locally installed Copilot CLI. */
export interface CliUpgradePort {
    upgrade(): Promise<void>;
}
