import { Command } from 'commander';
import { runLocalAction } from '../../actions/local_action';
import { TITLE } from '../../utils/constants';
import { getSetupToken } from '../../utils/setup_files';
import { logError, logInfo } from '../../utils/logger';
import { getGitInfo, isInsideGitRepo } from '../../cli_context';
import { buildSetupParams } from './setup_policy';
import { loadSetupConfigurationOverrides } from '../setup_config_file';
import { SetupWizardUseCase } from '../../application/usecases/setup';
import { SETUP_FEATURE_DESCRIPTIONS, buildSetupCredentialRequirements } from '../../application/policies/setup_configuration_policy';
import type { SetupConfigurationOverrides } from '../../application/policies/setup_configuration_policy';
import { createSetupCredentialsUseCase } from '../../infrastructure/composition/setup_credentials_composition_root';
import { SetupWorkspaceAdapter } from '../../infrastructure/setup_workspace_adapter';

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description(`${TITLE} - Interactive repository setup: select workflows, agents, Variables, labels, and issue types`)
    .option('-d, --debug', 'Debug mode', false)
    .option('-t, --token <token>', 'Personal access token (or PERSONAL_ACCESS_TOKEN from the environment)')
    .option('--agent <provider>', 'Use one agent runtime for every setup task (codex|opencode|cursor)')
    .option('--features <features>', 'Comma-separated setup features, or "all" (for non-interactive setup)')
    .option('--config <path>', 'YAML or JSON file with setup overrides')
    .option('--non-interactive', 'Use defaults and config-file values without prompting', false)
    .option('--yes', 'Apply the plan without the final confirmation prompt', false)
    .option('--dry-run', 'Show the setup plan without changing files or GitHub', false)
    .option('--skip-variables', 'Do not create or update GitHub Repository Variables', false)
    .option('--skip-secrets', 'Do not validate or create/update GitHub Repository Secrets', false)
    .option('--update-workflows', 'Allow setup-managed workflows already in the repository to be updated', false)
    .option('--workflow-pat <token>', 'Workflow PAT for the bot account (prefer the hidden interactive prompt)')
    .option('--secret <name=value>', 'Secret value for non-interactive setup; repeat for each API key', collectSecret, {})
    .action(async (options) => {
      const { SetupPromptAdapter } = await import('../setup_prompt_adapter');
      const prompt = new SetupPromptAdapter({
        interactive: !options.nonInteractive,
        assumeYes: Boolean(options.yes || options.nonInteractive || options.dryRun),
        credentialValues: {
          ...(options.workflowPat ? { PAT: options.workflowPat } : {}),
          ...options.secret,
        },
      });
      const cwd = process.cwd();
      try {
        logInfo('🔍 Checking we are inside a git repository...');
        if (!isInsideGitRepo(cwd)) {
          logError('❌ Not a git repository. Run "copilot setup" from the root of a git repo.');
          process.exit(1);
          return;
        }
        logInfo('✅ Git repository detected.');
        logInfo('🔗 Resolving repository (owner/repo)...');
        const gitInfo = getGitInfo();
        if ('error' in gitInfo) {
          logError(gitInfo.error);
          process.exit(1);
          return;
        }
        logInfo(`📦 Repository: ${gitInfo.owner}/${gitInfo.repo}`);
        let token = getSetupToken(cwd, options.token);
        if (!token && !options.nonInteractive && !options.dryRun) token = await prompt.requestSetupPat();
        if (!token && !options.dryRun) {
          logError('🛑 Setup requires PERSONAL_ACCESS_TOKEN with a valid token.');
          logInfo('   You can:');
          logInfo('   • Pass it on the command line: copilot setup --token <your_github_token>');
          logInfo('   • Add it to your environment: export PERSONAL_ACCESS_TOKEN=your_github_token');
          process.exit(1);
          return;
        }
        logInfo(options.dryRun ? '🧭 Building a dry-run setup plan...' : '🧭 Building your setup plan...');
        const wizard = new SetupWizardUseCase(prompt);
        const overrides = loadSetupOverrides(options);
        const configuration = await wizard.collect({
          overrides,
          skipRepositoryVariables: Boolean(options.skipVariables),
        });
        if (!configuration) {
          logInfo('⏭️  Setup cancelled. No changes were applied.');
          return;
        }
        const workflowComparisons = new SetupWorkspaceAdapter().compareWorkflows(configuration.features);
        const updateWorkflows = await prompt.confirmWorkflowUpdates(workflowComparisons, Boolean(options.updateWorkflows));
        const approvedWorkflowFiles = updateWorkflows
          ? workflowComparisons.filter(comparison => comparison.status === 'changed').map(comparison => comparison.file)
          : [];
        if (options.dryRun) {
          logInfo('✅ Dry run complete. No files or GitHub resources were changed.');
          return;
        }
        const credentials = await createSetupCredentialsUseCase(prompt).collect({
          owner: gitInfo.owner,
          repository: gitInfo.repo,
          setupToken: token ?? '',
          requirements: buildSetupCredentialRequirements(configuration),
          manageSecrets: !options.skipSecrets && configuration.manageRepositorySecrets,
          ref: configuration.repository.mainBranch,
        });
        logInfo('⚙️  Applying the approved setup plan...');
        const params = buildSetupParams(options, gitInfo, token ?? '', configuration, credentials.collection, approvedWorkflowFiles);
        if (!params) return;
        await runLocalAction(params);
      } catch (error) {
        logError(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      } finally {
        prompt.close();
      }
    });
}

function collectSecret(value: string, previous: Record<string, string>): Record<string, string> {
  const separator = value.indexOf('=');
  if (separator <= 0) throw new Error('--secret must use NAME=VALUE syntax.');
  const name = value.slice(0, separator).trim();
  const secret = value.slice(separator + 1);
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !secret) throw new Error('--secret must use a non-empty NAME=VALUE with an uppercase secret name.');
  return { ...previous, [name]: secret };
}

function loadSetupOverrides(options: {
  config?: string;
  agent?: string;
  features?: string;
}): SetupConfigurationOverrides {
  const fromFile = options.config ? loadSetupConfigurationOverrides(options.config) : {};
  const fromFlags: SetupConfigurationOverrides = {};
  if (options.agent) {
    if (!['codex', 'opencode', 'cursor'].includes(options.agent)) {
      throw new Error('--agent must be one of: codex, opencode, cursor.');
    }
    fromFlags.agents = Object.fromEntries(
      ['planner', 'findings', 'reviewer', 'fixer', 'tester', 'release'].map(task => [task, { provider: options.agent }]),
    ) as SetupConfigurationOverrides['agents'];
  }
  if (options.features) {
    if (options.features.trim().toLowerCase() === 'all') {
      fromFlags.features = Object.fromEntries(Object.keys(SETUP_FEATURE_DESCRIPTIONS).map(feature => [feature, true]));
    } else {
      const requested = options.features.split(',').map(feature => feature.trim()).filter(Boolean);
      const unknown = requested.filter(feature => !Object.prototype.hasOwnProperty.call(SETUP_FEATURE_DESCRIPTIONS, feature));
      if (unknown.length > 0) throw new Error(`Unknown setup feature(s): ${unknown.join(', ')}.`);
      fromFlags.features = Object.fromEntries(Object.keys(SETUP_FEATURE_DESCRIPTIONS).map(feature => [feature, requested.includes(feature)]));
    }
  }
  return mergeSetupOverrides(fromFile, fromFlags);
}

function mergeSetupOverrides(
  fileOverrides: SetupConfigurationOverrides,
  flagOverrides: SetupConfigurationOverrides,
): SetupConfigurationOverrides {
  return {
    ...fileOverrides,
    ...flagOverrides,
    features: { ...fileOverrides.features, ...flagOverrides.features },
    agents: { ...fileOverrides.agents, ...flagOverrides.agents },
    repository: { ...fileOverrides.repository, ...flagOverrides.repository },
    ai: { ...fileOverrides.ai, ...flagOverrides.ai },
    projects: { ...fileOverrides.projects, ...flagOverrides.projects },
  };
}
