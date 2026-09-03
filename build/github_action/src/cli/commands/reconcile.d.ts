import { Command } from 'commander';
import type { SetupWorkspacePort } from '../../application/ports/setup_workspace_ports';
export interface ReconcileCommandOptions {
    config?: string;
    apply?: boolean;
    json?: boolean;
}
/** Reconciles setup-managed workflow files locally; remote GitHub state is never changed. */
export declare function registerReconcileCommand(program: Command): void;
export declare function runReconcileCommand(options: ReconcileCommandOptions, workspace?: SetupWorkspacePort): void;
