import { Command } from 'commander';
export interface UpgradeCommandRunner {
    execute(): Promise<void>;
}
export declare function runUpgradeCommand(runner?: UpgradeCommandRunner): Promise<void>;
export declare function registerUpgradeCommand(program: Command): void;
