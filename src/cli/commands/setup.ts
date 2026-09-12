import { Command } from 'commander';
import { runLocalAction } from '../../actions/local_action';
import { TITLE } from '../../application/contracts/product_identity';
import { getSetupToken } from '../../utils/setup_files';
import { logError, logInfo } from '../../utils/logger';
import { getGitInfo, isInsideGitRepo } from '../../cli_context';
import { buildSetupParams } from './setup_policy';
import { loadSetupConfigurationOverrides } from '../setup_config_file';
import { SetupQuestionnaireController, SetupWizardUseCase } from '../../application/usecases/setup';
import { SETUP_FEATURE_DESCRIPTIONS, buildSetupCredentialRequirements } from '../../application/policies/setup_configuration_policy';
import type { SetupConfigurationOverrides } from '../../application/policies/setup_configuration_policy';
import { createSetupCredentialsUseCase, createSetupRemoteConfigurationReadPort } from '../../infrastructure/composition/setup_credentials_composition_root';
import { createSetupMergeQueueReadinessUseCase } from '../../infrastructure/composition/setup_doctor_composition_root';
import { SetupDoctorWorkspaceQueryAdapter } from '../../infrastructure/setup_workspace_adapter';
import type { SetupResourceScope } from '../../domain/setup';
import { toApplicationError } from '../../application/errors/application_error';
import { createInteractiveTerminalDriver } from '../setup_terminal_driver';
import { ConsoleSetupQuestionRenderer } from '../setup_question_renderer';
import { ConsoleSetupPlanPresenter } from '../setup_plan_presenter';
import { DryRunSetupPlanConfirmation, SetupPlanConfirmationAdapter } from '../setup_confirmation_adapter';
import { SetupCredentialPromptAdapter, SetupTerminalCancelledError } from '../setup_credential_prompt_adapter';
import { SetupWorkflowUpdatePromptAdapter } from '../setup_workflow_update_prompt_adapter';

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
    .option('--variables-scope <scope>', 'Default Variable scope (repository|organization)')
    .option('--secrets-scope <scope>', 'Default Secret scope (repository|organization)')
    .option('--variables-visibility <visibility>', 'Organization Variable visibility (selected|private|all)')
    .option('--secrets-visibility <visibility>', 'Organization Secret visibility (selected|private|all)')
    .option('--variable-scope <name=scope>', 'Per-variable scope override; repeat as needed', collectScope, {})
    .option('--secret-scope <name=scope>', 'Per-secret scope override; repeat as needed', collectScope, {})
    .option('--update-workflows', 'Allow setup-managed workflows already in the repository to be updated', false)
    .option('--workflow-pat <token>', 'Workflow PAT for the bot account (prefer the hidden interactive prompt)')
    .option('--secret <name=value>', 'Secret value for non-interactive setup; repeat for each API key', collectSecret, {})
    .action(async (options) => {
      const terminal = options.nonInteractive ? undefined : createInteractiveTerminalDriver();
      const credentialPrompt = new SetupCredentialPromptAdapter(terminal, {
        ...(options.workflowPat ? { PAT: options.workflowPat } : {}),
        ...options.secret,
      });
      const workflowPrompt = new SetupWorkflowUpdatePromptAdapter(terminal);
      const cwd = process.cwd();
      try {
        if (!options.nonInteractive && !terminal) {
          logError('Interactive setup requires a terminal. Use --non-interactive with explicit configuration.');
          process.exitCode = 1;
          return;
        }
        logInfo('🔍 Checking we are inside a git repository...');
        if (!isInsideGitRepo(cwd)) {
          logError('❌ Not a git repository. Run "copilot setup" from the root of a git repo.');
          process.exitCode = 1;
          return;
        }
        logInfo('✅ Git repository detected.');
        logInfo('🔗 Resolving repository (owner/repo)...');
        const gitInfo = getGitInfo();
        if ('error' in gitInfo) {
          logError(gitInfo.error);
          process.exitCode = 1;
          return;
        }
        logInfo(`📦 Repository: ${gitInfo.owner}/${gitInfo.repo}`);
        let token = getSetupToken(cwd, options.token);
        if (!token && !options.nonInteractive && !options.dryRun) token = await credentialPrompt.requestSetupPat();
        if (!token && !options.dryRun) {
          logError('🛑 Setup requires PERSONAL_ACCESS_TOKEN with a valid token.');
          logInfo('   You can:');
          logInfo('   • Pass it on the command line: copilot setup --token <your_github_token>');
          logInfo('   • Add it to your environment: export PERSONAL_ACCESS_TOKEN=your_github_token');
          process.exitCode = 1;
          return;
        }
        logInfo(options.dryRun ? '🧭 Building a dry-run setup plan...' : '🧭 Building your setup plan...');
        const remoteConfigurationReader = createSetupRemoteConfigurationReadPort();
        const wizard = new SetupWizardUseCase({
          ...(terminal ? {
            collector: new SetupQuestionnaireController(terminal, new ConsoleSetupQuestionRenderer()),
          } : {}),
          planPresenter: new ConsoleSetupPlanPresenter(),
          confirmation: options.dryRun
            ? new DryRunSetupPlanConfirmation()
            : new SetupPlanConfirmationAdapter(terminal, Boolean(options.yes)),
          remoteConfiguration: remoteConfigurationReader,
          mergeQueueReadiness: createSetupMergeQueueReadinessUseCase(),
        });
        const overrides = loadSetupOverrides(options);
        const result = await wizard.execute({
          mode: options.nonInteractive ? 'non-interactive' : 'interactive',
          overrides,
          skipRepositoryVariables: Boolean(options.skipVariables),
          skipRepositorySecrets: Boolean(options.skipSecrets),
          ...(token ? { remoteTarget: { owner: gitInfo.owner, repository: gitInfo.repo, token } } : {}),
        });
        if (result.status === 'cancelled') {
          if (result.reason !== 'questionnaire-cancelled') {
            logInfo('⏭️  Setup cancelled. No changes were applied.');
          }
          if (result.exitCode !== 0) process.exitCode = result.exitCode;
          return;
        }
        const { configuration, remoteConfiguration } = result;
        const workflowComparisons = new SetupDoctorWorkspaceQueryAdapter().compareWorkflows(configuration.features);
        const updateWorkflows = await workflowPrompt.confirmWorkflowUpdates(workflowComparisons, Boolean(options.updateWorkflows));
        const approvedWorkflowFiles = updateWorkflows
          ? workflowComparisons.filter(comparison => comparison.status === 'changed').map(comparison => comparison.file)
          : [];
        if (options.dryRun) {
          logInfo('✅ Dry run complete. No files or GitHub resources were changed.');
          return;
        }
        const credentials = await createSetupCredentialsUseCase(credentialPrompt).collect({
          owner: gitInfo.owner,
          repository: gitInfo.repo,
          setupToken: token ?? '',
          requirements: buildSetupCredentialRequirements(configuration),
          manageSecrets: !options.skipSecrets && configuration.manageRepositorySecrets,
          ref: configuration.repository.mainBranch,
          remoteConfiguration,
        });
        logInfo('⚙️  Applying the approved setup plan...');
        const params = buildSetupParams(
          options,
          gitInfo,
          token ?? '',
          configuration,
          credentials.collection,
          approvedWorkflowFiles,
          remoteConfiguration,
        );
        if (!params) return;
        await runLocalAction(params);
      } catch (error) {
        if (error instanceof SetupTerminalCancelledError) {
          logInfo('Setup cancelled. No changes were applied.');
          process.exitCode = 130;
          return;
        }
        logError(toApplicationError(error, 'workflow.failed', 'Setup failed.'));
        process.exitCode = 1;
      } finally {
        terminal?.close();
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
  variablesScope?: string;
  secretsScope?: string;
  variablesVisibility?: string;
  secretsVisibility?: string;
  variableScope?: Record<string, SetupResourceScope>;
  secretScope?: Record<string, SetupResourceScope>;
}): SetupConfigurationOverrides {
  const fromFile = options.config ? loadSetupConfigurationOverrides(options.config) : {};
  const fromFlags: SetupConfigurationOverrides = {};
  if (options.agent) {
    if (!['codex', 'opencode', 'cursor'].includes(options.agent)) {
      throw new Error('--agent must be one of: codex, opencode, cursor.');
    }
    fromFlags.agents = Object.fromEntries(
      ['planner', 'findings', 'reviewer', 'fixer', 'tester'].map(task => [task, { provider: options.agent }]),
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
  const storage: NonNullable<SetupConfigurationOverrides['storage']> = {};
  if (options.variablesScope || options.variablesVisibility || Object.keys(options.variableScope ?? {}).length > 0) {
    storage.variables = {
      ...(options.variablesScope ? { defaultScope: parseScope(options.variablesScope, '--variables-scope') } : {}),
      ...(options.variablesVisibility ? { organizationVisibility: parseVisibility(options.variablesVisibility, '--variables-visibility') } : {}),
      ...(Object.keys(options.variableScope ?? {}).length > 0 ? { overrides: options.variableScope } : {}),
    };
  }
  if (options.secretsScope || options.secretsVisibility || Object.keys(options.secretScope ?? {}).length > 0) {
    storage.secrets = {
      ...(options.secretsScope ? { defaultScope: parseScope(options.secretsScope, '--secrets-scope') } : {}),
      ...(options.secretsVisibility ? { organizationVisibility: parseVisibility(options.secretsVisibility, '--secrets-visibility') } : {}),
      ...(Object.keys(options.secretScope ?? {}).length > 0 ? { overrides: options.secretScope } : {}),
    };
  }
  if (Object.keys(storage).length > 0) fromFlags.storage = storage;
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
    storage: {
      ...fileOverrides.storage,
      ...flagOverrides.storage,
      secrets: { ...fileOverrides.storage?.secrets, ...flagOverrides.storage?.secrets, overrides: { ...fileOverrides.storage?.secrets?.overrides, ...flagOverrides.storage?.secrets?.overrides } },
      variables: { ...fileOverrides.storage?.variables, ...flagOverrides.storage?.variables, overrides: { ...fileOverrides.storage?.variables?.overrides, ...flagOverrides.storage?.variables?.overrides } },
    },
  };
}

function collectScope(value: string, previous: Record<string, SetupResourceScope>): Record<string, SetupResourceScope> {
  const separator = value.indexOf('=');
  if (separator <= 0) throw new Error('Scope overrides must use NAME=repository or NAME=organization syntax.');
  const name = value.slice(0, separator).trim();
  const scope = value.slice(separator + 1).trim().toLowerCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !['repository', 'organization'].includes(scope)) {
    throw new Error('Scope overrides must use an uppercase NAME and repository or organization scope.');
  }
  return { ...previous, [name]: scope as SetupResourceScope };
}

function parseScope(value: string, flag: string): 'repository' | 'organization' {
  const normalized = value.trim().toLowerCase();
  if (normalized !== 'repository' && normalized !== 'organization') throw new Error(`${flag} must be repository or organization.`);
  return normalized;
}

function parseVisibility(value: string, flag: string): 'all' | 'private' | 'selected' {
  const normalized = value.trim().toLowerCase();
  if (!['all', 'private', 'selected'].includes(normalized)) throw new Error(`${flag} must be selected, private, or all.`);
  return normalized as 'all' | 'private' | 'selected';
}
