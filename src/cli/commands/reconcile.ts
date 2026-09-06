import { Command } from 'commander';
import { getGitInfo, isInsideGitRepo } from '../../cli_context';
import { createDefaultSetupConfiguration, mergeSetupConfiguration } from '../../application/policies/setup_configuration_policy';
import { loadSetupConfigurationOverrides } from '../setup_config_file';
import { SetupWorkspaceAdapter } from '../../infrastructure/setup_workspace_adapter';
import type { SetupWorkspacePort, SetupWorkspaceResult } from '../../application/ports/setup_workspace_ports';

export interface ReconcileCommandOptions {
    config?: string;
    apply?: boolean;
    json?: boolean;
}

/** Reconciles setup-managed workflow files locally; remote GitHub state is never changed. */
export function registerReconcileCommand(program: Command): void {
    program
        .command('reconcile')
        .description('Detect setup drift and optionally reconcile setup-managed workflow files')
        .option('--config <path>', 'YAML or JSON setup configuration used as the expected contract')
        .option('--apply', 'Apply local workflow/template reconciliation after showing the drift')
        .option('--json', 'Print a machine-readable reconciliation report')
        .action((options: ReconcileCommandOptions) => runReconcileCommand(options));
}

export function runReconcileCommand(
    options: ReconcileCommandOptions,
    workspace: SetupWorkspacePort = new SetupWorkspaceAdapter(),
): void {
    const cwd = process.cwd();
    if (!isInsideGitRepo(cwd)) throw new Error('Run "copilot reconcile" from the root of a git repository.');
    const gitInfo = getGitInfo();
    if ('error' in gitInfo) throw new Error(gitInfo.error);

    const overrides = options.config ? loadSetupConfigurationOverrides(options.config) : {};
    const configuration = mergeSetupConfiguration(createDefaultSetupConfiguration(), overrides);
    const comparisons = [...(workspace.compareWorkflows?.(configuration.features) ?? [])];
    const drift = comparisons.filter(comparison => comparison.status !== 'unchanged');
    const report = {
        repository: `${gitInfo.owner}/${gitInfo.repo}`,
        scope: 'setup-workflows',
        driftDetected: drift.length > 0,
        applied: false,
        files: comparisons,
        result: undefined as SetupWorkspaceResult | undefined,
    };

    if (options.apply && drift.length > 0) {
        report.result = workspace.prepare({
            features: configuration.features,
            updateExistingWorkflows: true,
            approvedWorkflowFiles: drift.map(comparison => comparison.file),
        });
        report.applied = true;
    }

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(`🔎 Reconciling ${report.scope} for ${report.repository}...`);
        if (comparisons.length === 0) console.log('  No setup-managed workflows were found in the package contract.');
        for (const comparison of comparisons) {
            const icon = comparison.status === 'unchanged' ? '✅' : comparison.status === 'missing' ? '❌' : '⚠️';
            console.log(`  ${icon} ${comparison.destination} (${comparison.status})`);
        }
        if (report.result) console.log(`✅ Reconciliation applied: ${report.result.copied} copied, ${report.result.skipped} skipped.`);
    }

    if (report.applied) {
        process.exitCode = 0;
        return;
    }

    if (drift.length > 0) {
        if (!options.json) console.log('ℹ️  Run with --apply to reconcile the local setup-managed files.');
        process.exitCode = 1;
    } else {
        process.exitCode = 0;
    }
}
