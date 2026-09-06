import { Command } from 'commander';
import { type CliUpdateChecker } from './cli_update_notification';
export declare function createCliProgram(updateChecker?: CliUpdateChecker): Command;
