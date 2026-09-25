import { Command } from 'commander';
import { runLocalAction } from '../../actions/local_action';
import { TITLE } from '../../application/contracts/product_identity';
import { getSetupToken } from '../../utils/setup_files';
import { logError, logInfo } from '../../utils/logger';
import { getGitInfo, isInsideGitRepo } from '../../cli_context';
import { buildSetupParams } from './setup_policy';
import { loadSetupConfigurationOverrides } from '../setup_config_file';
import { SetupQuestionnaireController, SetupWizardUseCase } from '../../application/usecases/setup';
import { buildInitialSetupConfiguration } from '../../application/usecases/setup/setup_wizard_use_case';
import { createSetupPermissionIntentQuestionnaire } from '../../application/policies/setup_questionnaire_policy';
import { fixedSetupPatIntentQuestionIds, setupPatIntentNeedsOwnerKind, setupPatIntentOwnerConflict } from '../../application/policies/setup_pat_intent_policy';
import {
  SETUP_FEATURE_DESCRIPTIONS,
  buildSetupCredentialRequirements,
  effectiveIssueWorkflowFeatures,
  validateSetupConfiguration,
} from '../../application/policies/setup_configuration_policy';
import {
  buildConfiguredSetupPatPermissionRequirements,
  buildSetupPatPermissionRequirements,
  buildSetupPatIntentPermissionRequirements,
  buildSetupPatIntentUncertainty,
  buildWorkflowPatPermissionRequirements,
} from '../../application/policies/setup_token_permission_policy';
import type { SetupConfigurationOverrides } from '../../application/policies/setup_configuration_policy';
import { createSetupCredentialsUseCase, createSetupRemoteConfigurationReadPort } from '../../infrastructure/composition/setup_credentials_composition_root';
import { createSetupMergeQueueReadinessUseCase } from '../../infrastructure/composition/setup_doctor_composition_root';
import { SetupDoctorWorkspaceQueryAdapter } from '../../infrastructure/setup_workspace_adapter';
import { GithubSetupApprovalReadinessAdapter } from '../../infrastructure/setup_approval_readiness_adapter';
import type { SetupConfiguration, SetupRemoteConfiguration, SetupResourceScope } from '../../domain/setup';
import { ISSUE_WORKFLOW_KINDS, type IssueWorkflowKind } from '../../domain/issue_workflow_profile';
import { ApplicationError, toApplicationError } from '../../application/errors/application_error';
import { createInteractiveTerminalDriver } from '../setup_terminal_driver';
import { ConsoleSetupQuestionRenderer } from '../setup_question_renderer';
import { ConsoleSetupPlanPresenter } from '../setup_plan_presenter';
import { DryRunSetupPlanConfirmation, SetupPlanConfirmationAdapter } from '../setup_confirmation_adapter';
import { SetupCredentialPromptAdapter, SetupTerminalCancelledError } from '../setup_credential_prompt_adapter';
import { SetupWorkflowUpdatePromptAdapter } from '../setup_workflow_update_prompt_adapter';
import { ConsoleSetupTokenPermissionPresenter } from '../setup_token_permission_presenter';
import { createSetupTokenPermissionsUseCase } from '../../infrastructure/composition/setup_token_permissions_composition_root';
import { buildSetupPatCreationUrl, UnsupportedSetupPatLinkError } from '../../application/policies/setup_pat_creation_url_policy';
import { SetupGithubIdentityQueryAdapter } from '../../infrastructure/setup_github_identity_query_adapter';
import { VerifyGuidedWorkflowPatIdentityUseCase } from '../../application/usecases/setup/verify_guided_workflow_pat_identity_use_case';
import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description(`${TITLE} - Interactive repository setup: select workflows, agents, Variables, labels, and issue types`)
    .option('-d, --debug', 'Debug mode', false)
    .option('-t, --token <token>', 'Personal access token (or PERSONAL_ACCESS_TOKEN from the environment)')
    .option('--agent <provider>', 'Use one agent runtime for every setup task (codex|opencode|cursor)')
    .option('--features <features>', 'Comma-separated setup features, or "all" (for non-interactive setup)')
    .option('--issue-workflows <types>', 'Comma-separated issue workflow types, or "all" (for non-interactive setup)')
    .option('--agent-guidance <mode>', 'Generated agent guidance mode (prompt|create-if-missing|disabled)')
    .option('--config <path>', 'YAML or JSON file with setup overrides')
    .option('--pr-approval-mode <mode>', 'PR bot approval: recommend (new setup default), guarded, or off')
    .option('--pr-approval-check <identity>', 'Exact test producer name|source-App-ID|workflow-name; repeat for multiple checks', collectApprovalCheck, [])
    .option('--pr-approval-coverage-check <name>', 'Exact selected check that enforces the coverage budget')
    .option('--pr-approval-attest-producer', 'Confirm exact check/App/workflow identity and a coverage-enforcing CI step', false)
    .option('--non-interactive', 'Use defaults and config-file values without prompting', false)
    .option('--yes', 'Apply the plan without the final confirmation prompt', false)
    .option('--confirm-unverifiable-write-permissions', 'Confirm that required PAT write permissions shown as Unverifiable were configured exactly as displayed', false)
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
      }, Boolean(options.confirmUnverifiableWritePermissions));
      const permissionPresenter = new ConsoleSetupTokenPermissionPresenter();
      const tokenPermissions = createSetupTokenPermissionsUseCase();
      const workflowPrompt = new SetupWorkflowUpdatePromptAdapter(terminal);
      const cwd = process.cwd();
      let setupMutationStarted = false;
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
        const overrides = loadSetupOverrides(options);
        let setupPatPermissions = buildSetupPatPermissionRequirements();
        permissionPresenter.showRequirements('setup', setupPatPermissions);
        let token = getSetupToken(cwd, options.token);
        let setupPatAccount: string | undefined;
        let permissionIntent: { draft: SetupConfiguration; answeredQuestionIds: readonly string[] } | undefined;
        let assertedOwnerKind: 'Organization' | 'User' | undefined;
        if (!token && !options.nonInteractive && !options.dryRun) {
          if (await credentialPrompt.chooseSetupPatMethod() === 'guided') {
            const fixedQuestionIds = fixedSetupPatIntentQuestionIds(overrides, Boolean(options.skipVariables), Boolean(options.skipSecrets));
            let draft = buildInitialSetupConfiguration({
              mode: 'interactive', overrides,
              skipRepositoryVariables: Boolean(options.skipVariables),
              skipRepositorySecrets: Boolean(options.skipSecrets),
            });
            while (true) {
              const context = { skipQuestionIds: fixedQuestionIds };
              const collector = new SetupQuestionnaireController(terminal!, new ConsoleSetupQuestionRenderer('permission-intent'));
              const intent = await collector.collect(createSetupPermissionIntentQuestionnaire(draft, context), context);
              if (intent.terminal === 'cancelled') throw new SetupTerminalCancelledError();
              draft = intent.draft;
              const ownerKind = setupPatIntentNeedsOwnerKind(draft)
                ? await credentialPrompt.chooseSetupOwnerKind() : 'User';
              if (ownerKind === 'unknown') {
                logInfo('Owner type was not confirmed. Use the manual PAT table, or check whether the GitHub owner is an organization before retrying guided setup.');
                credentialPrompt.useManualSetupPat();
                break;
              }
              if (setupPatIntentOwnerConflict(draft, ownerKind)) {
                logInfo('This plan selects organization storage or Projects, but the owner was declared a personal account. Revise the choices or use the manual PAT path.');
              }
              const intentErrors = validateSetupConfiguration(draft, { allowIncompleteApproval: true });
              if (intentErrors.length > 0) {
                logInfo(`The selected local configuration needs correction before a guided link can be generated:\n${intentErrors.map(item => `  - ${item}`).join('\n')}`);
              }
              const preview = buildSetupPatIntentPermissionRequirements(draft, ownerKind);
              logInfo('Permission intent:');
              logInfo(`  Initial tag: ${draft.createInitialTag ? 'yes' : 'no'}; issue workflows: ${draft.features.issues ? draft.issueWorkflows.enabled.join(', ') || 'none' : 'disabled'}; PR approval: ${draft.pullRequestApproval.mode}`);
              logInfo(`  Secrets: ${draft.manageRepositorySecrets ? draft.storage.secrets.defaultScope : 'off'}; Variables: ${draft.manageRepositoryVariables ? draft.storage.variables.defaultScope : 'off'}; Projects: ${draft.projects.ids.trim() || 'none'}`);
              permissionPresenter.showRequirements('setup', preview);
              const uncertain = buildSetupPatIntentUncertainty(draft, ownerKind);
              if (uncertain.length) logInfo(`May need after GitHub inspection:\n${uncertain.map(item => `  - ${item}`).join('\n')}`);
              const decision = await credentialPrompt.reviewSetupPatIntent();
              if (decision === 'manual') {
                credentialPrompt.useManualSetupPat();
                break;
              }
              if (decision === 'revise') continue;
              if (setupPatIntentOwnerConflict(draft, ownerKind) || intentErrors.length > 0) {
                throw new ApplicationError('configuration.invalid', 'Correct the reported setup intent or local --config/flags, then retry guided setup. No PAT was requested.');
              }
              try {
                const url = buildSetupPatCreationUrl({
                  role: 'setup', owner: gitInfo.owner, repository: gitInfo.repo, expiresIn: 1,
                  requirements: preview,
                });
                credentialPrompt.configureSetupPatGuide(url);
                setupPatPermissions = preview;
                assertedOwnerKind = ownerKind;
                permissionIntent = { draft, answeredQuestionIds: [...new Set([...fixedQuestionIds, ...(intent.answeredQuestionIds ?? [])])] };
              } catch (error) {
                if (!(error instanceof UnsupportedSetupPatLinkError)) throw error;
                logInfo('A guided setup PAT link is unavailable for this owner or permission set. Enter a manually created PAT using the table above.');
                credentialPrompt.useManualSetupPat();
              }
              break;
            }
          }
        }
        if (!token && !options.nonInteractive && !options.dryRun) token = await credentialPrompt.requestSetupPat();
        if (!token && !options.dryRun) {
          logError('🛑 Setup requires PERSONAL_ACCESS_TOKEN with a valid token.');
          logInfo('   You can:');
          logInfo('   • Pass it on the command line: copilot setup --token <your_github_token>');
          logInfo('   • Add it to your environment: export PERSONAL_ACCESS_TOKEN=your_github_token');
          process.exitCode = 1;
          return;
        }
        if (token) {
          const permissionReport = await tokenPermissions.inspect({
            role: 'setup',
            owner: gitInfo.owner,
            repository: gitInfo.repo,
            token,
            requirements: setupPatPermissions,
          });
          permissionPresenter.showReport(permissionReport);
          const permissionAccepted = permissionReport.ready
            || (permissionReport.confirmationRequired
              && await credentialPrompt.confirmUnverifiableTokenPermissions(permissionReport));
          if (!permissionAccepted || permissionReport.identityStatus !== 'valid') {
            if (credentialPrompt.usedGuidedSetupPat) credentialPrompt.showUpdatedSetupPatLink(buildSetupPatCreationUrl({
              role: 'setup', owner: gitInfo.owner, repository: gitInfo.repo, expiresIn: 1,
              requirements: setupPatPermissions,
            }), 'bootstrap');
            throw new ApplicationError(
              'authorization.credential-invalid',
              'The setup PAT has missing or unconfirmed required access. Grant or explicitly confirm the permissions shown above and retry.',
            );
          }
          if (!await credentialPrompt.confirmGuidedSetupAccount(permissionReport.account)) {
            throw new ApplicationError('authorization.credential-invalid', 'The setup PAT belongs to an unintended account. Revoke it in GitHub and retry with the correct account.');
          }
          setupPatAccount = permissionReport.account;
        }
        logInfo(options.dryRun ? '🧭 Building a dry-run setup plan...' : '🧭 Building your setup plan...');
        const auditConfiguredSetupPat = async (
          configuration: Readonly<SetupConfiguration>,
          remoteConfiguration?: Readonly<SetupRemoteConfiguration>,
        ): Promise<{ status: 'accepted' } | { status: 'blocked'; errors: readonly string[] }> => {
          const configuredSetupPatPermissions = buildConfiguredSetupPatPermissionRequirements(configuration, remoteConfiguration);
          permissionPresenter.showRequirements('setup', configuredSetupPatPermissions);
          if (assertedOwnerKind && remoteConfiguration && remoteConfiguration.ownerType !== 'Unknown'
            && remoteConfiguration.ownerType !== assertedOwnerKind) {
            logInfo(`The owner was declared ${assertedOwnerKind}, but GitHub reports ${remoteConfiguration.ownerType}. The guided link is no longer valid for this plan.`);
            if (credentialPrompt.usedGuidedSetupPat) credentialPrompt.showUpdatedSetupPatLink(buildSetupPatCreationUrl({
              role: 'setup', owner: gitInfo.owner, repository: gitInfo.repo, expiresIn: 1,
              requirements: configuredSetupPatPermissions,
            }), 'final', setupPatPermissionDelta(setupPatPermissions, configuredSetupPatPermissions));
            return { status: 'blocked', errors: ['Repository owner type differs from the pre-PAT selection. Rerun setup with the correct owner type and PAT.'] };
          }
          if (credentialPrompt.usedGuidedSetupPat) {
            const removed = setupPatPermissionDelta(configuredSetupPatPermissions, setupPatPermissions);
            if (removed.length) logInfo(`The final plan no longer requires grants suggested earlier: ${removed.join(', ')}. Your PAT may have excess access; replace it in GitHub if least privilege is required.`);
          }
          if (!token) return { status: 'accepted' };
          const permissionReport = await tokenPermissions.inspect({
            role: 'setup', owner: gitInfo.owner, repository: gitInfo.repo, token,
            requirements: configuredSetupPatPermissions,
          });
          permissionPresenter.showReport(permissionReport);
          const permissionAccepted = permissionReport.ready
            || (permissionReport.confirmationRequired
              && await credentialPrompt.confirmUnverifiableTokenPermissions(permissionReport));
          if (!permissionAccepted || permissionReport.identityStatus !== 'valid') {
            if (credentialPrompt.usedGuidedSetupPat) credentialPrompt.showUpdatedSetupPatLink(buildSetupPatCreationUrl({
              role: 'setup', owner: gitInfo.owner, repository: gitInfo.repo, expiresIn: 1,
              requirements: configuredSetupPatPermissions,
            }), 'final', setupPatPermissionDelta(setupPatPermissions, configuredSetupPatPermissions));
            return { status: 'blocked', errors: [
              'The setup PAT has missing or unconfirmed access required by the approved setup plan. Grant or explicitly confirm the permissions shown above and retry.',
            ] };
          }
          return { status: 'accepted' };
        };
        const remoteConfigurationReader = createSetupRemoteConfigurationReadPort();
        const wizard = new SetupWizardUseCase({
          ...(terminal ? {
            collector: new SetupQuestionnaireController(terminal, new ConsoleSetupQuestionRenderer()),
          } : {}),
          planPresenter: new ConsoleSetupPlanPresenter(),
          confirmation: options.dryRun
            ? new DryRunSetupPlanConfirmation()
            : new SetupPlanConfirmationAdapter(terminal, Boolean(options.yes)),
          finalPermissionAudit: { audit: auditConfiguredSetupPat },
          remoteConfiguration: remoteConfigurationReader,
          mergeQueueReadiness: createSetupMergeQueueReadinessUseCase(),
          approvalReadiness: new GithubSetupApprovalReadinessAdapter(),
        });
        const result = await wizard.execute({
          mode: options.nonInteractive ? 'non-interactive' : 'interactive',
          overrides,
          ...(permissionIntent ? { permissionIntent } : {}),
          skipRepositoryVariables: Boolean(options.skipVariables),
          skipRepositorySecrets: Boolean(options.skipSecrets),
          previewOnly: Boolean(options.dryRun),
          ...(token ? { remoteTarget: { owner: gitInfo.owner, repository: gitInfo.repo, token } } : {}),
        });
        if (result.status === 'cancelled') {
          if (result.reason !== 'questionnaire-cancelled') {
            logInfo('⏭️  Setup cancelled. No changes were applied.');
          }
          if (result.exitCode !== 0) process.exitCode = result.exitCode;
          return;
        }
        if (result.status === 'blocked') {
          logError(new ApplicationError(
            result.reason === 'setup-permissions-unavailable' ? 'authorization.credential-invalid' : 'provider.unavailable',
            `${result.reason === 'setup-permissions-unavailable'
              ? 'Setup is blocked by missing or unconfirmed PAT permissions:'
              : 'Setup is blocked by unavailable remote storage:'}\n${result.errors.map(error => `- ${error}`).join('\n')}`,
          ));
          process.exitCode = result.exitCode;
          return;
        }
        const { configuration, remoteConfiguration } = result;
        const credentialRequirements = buildSetupCredentialRequirements(configuration);
        const workflowComparisons = new SetupDoctorWorkspaceQueryAdapter().compareWorkflows(effectiveIssueWorkflowFeatures(configuration), configuration);
        const updateWorkflows = await workflowPrompt.confirmWorkflowUpdates(workflowComparisons, Boolean(options.updateWorkflows));
        const approvedWorkflowFiles = updateWorkflows
          ? workflowComparisons.filter(comparison => comparison.status === 'changed').map(comparison => comparison.file)
          : [];
        if (options.dryRun) {
          logInfo('✅ Dry run complete. No files or GitHub resources were changed.');
          return;
        }
        const workflowTokenPermissions = buildWorkflowPatPermissionRequirements(configuration, remoteConfiguration);
        const githubIdentities = new SetupGithubIdentityQueryAdapter();
        if (!options.nonInteractive && !options.workflowPat && !options.secret?.PAT) {
          try {
            const workflowPatGuide = buildSetupPatCreationUrl({
              role: 'workflow', owner: gitInfo.owner, repository: gitInfo.repo, expiresIn: 90,
              requirements: workflowTokenPermissions,
            });
            credentialPrompt.configureWorkflowPatGuide(workflowPatGuide, login => githubIdentities.resolve(login, token ?? ''));
          } catch (error) {
            if (!(error instanceof UnsupportedSetupPatLinkError)) throw error;
            logInfo('A guided fine-grained bot PAT link is unavailable for one or more required permissions. Use the permission table and manual path; review whether a classic PAT is required for this plan.');
          }
        }
        const credentials = await createSetupCredentialsUseCase(credentialPrompt, permissionPresenter).collect({
          owner: gitInfo.owner,
          repository: gitInfo.repo,
          setupToken: token ?? '',
          requirements: credentialRequirements,
          manageSecrets: !options.skipSecrets && configuration.manageRepositorySecrets,
          secretStoragePolicy: configuration.storage.secrets,
          ref: configuration.repository.mainBranch,
          remoteConfiguration,
          workflowTokenPermissions,
        });
        const guidedBotIdentity = credentialPrompt.guidedWorkflowBotIdentity;
        if (guidedBotIdentity && credentials.collection.workflowPat) {
          const verifiedBot = await new VerifyGuidedWorkflowPatIdentityUseCase(githubIdentities)
            .execute(guidedBotIdentity, credentials.collection.workflowPat.value);
          logInfo(`✅ Workflow PAT owner verified as @${verifiedBot.login} (GitHub account ID ${verifiedBot.id}).`);
          if (setupPatAccount?.toLowerCase() === verifiedBot.login.toLowerCase()) {
            logInfo('The workflow PAT and setup PAT use the same GitHub account. If this account authors PRs, bot-generated events and guarded self-approval may not behave as intended; use a dedicated bot account where required.');
          }
        }
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
        setupMutationStarted = true;
        const actionResults = await runLocalAction(params);
        if (actionResults.some(actionResult => !actionResult.success || actionResult.errors.length > 0)) {
          logInfo('Setup reported failures or partial completion. If a bot PAT was supplied, its Secret may already have been written; inspect the result and GitHub Secret name/scope before retrying or revoking it.');
          process.exitCode = 1;
        }
      } catch (error) {
        if (credentialPrompt.guidedWorkflowBotIdentity) {
          logInfo(setupMutationStarted
            ? 'Setup may be partially applied. Inspect the GitHub Secret before deleting or replacing the bot PAT.'
            : 'No setup mutation started. If you generated an unused bot PAT in GitHub, delete it there; Copilot cannot revoke it.');
        }
        if (error instanceof SetupTerminalCancelledError) {
          logInfo('Setup cancelled. No changes were applied.');
          process.exitCode = 130;
          return;
        }
        logError(toApplicationError(error, 'workflow.failed', 'Setup failed.'));
        process.exitCode = 1;
      } finally {
        credentialPrompt.showSetupPatCleanupReminder();
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

function collectApprovalCheck(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function setupPatPermissionDelta(
  before: readonly SetupTokenPermissionRequirement[],
  after: readonly SetupTokenPermissionRequirement[],
): string[] {
  const previous = new Map(before.filter(item => item.applicability === 'required')
    .map(item => [`${item.scope}:${item.permission.toLowerCase()}`, item.level]));
  return after.filter(item => item.applicability === 'required'
    && (previous.get(`${item.scope}:${item.permission.toLowerCase()}`) === undefined
      || (previous.get(`${item.scope}:${item.permission.toLowerCase()}`) === 'read' && item.level === 'write')))
    .map(item => `${item.scope} ${item.permission} ${item.level}`);
}

function loadSetupOverrides(options: {
  config?: string;
  agent?: string;
  features?: string;
  issueWorkflows?: string;
  agentGuidance?: string;
  variablesScope?: string;
  secretsScope?: string;
  variablesVisibility?: string;
  secretsVisibility?: string;
  variableScope?: Record<string, SetupResourceScope>;
  secretScope?: Record<string, SetupResourceScope>;
  prApprovalMode?: string;
  prApprovalCheck?: string[];
  prApprovalCoverageCheck?: string;
  prApprovalAttestProducer?: boolean;
}): SetupConfigurationOverrides {
  const fromFile = options.config ? loadSetupConfigurationOverrides(options.config) : {};
  const fromFlags: SetupConfigurationOverrides = {};
  if (options.prApprovalMode || options.prApprovalCheck?.length || options.prApprovalCoverageCheck || options.prApprovalAttestProducer) {
    if (options.prApprovalMode && !['off', 'recommend', 'guarded'].includes(options.prApprovalMode)) {
      throw new Error('--pr-approval-mode must be guarded, recommend, or off.');
    }
    const checks = options.prApprovalCheck?.map(value => {
      const [name, appId, workflowName] = value.split('|').map(item => item.trim());
      return { name, sourceAppId: Number(appId), workflowName };
    });
    fromFlags.pullRequestApproval = {
      ...(options.prApprovalMode ? { mode: options.prApprovalMode as 'off' | 'recommend' | 'guarded' } : {}),
      ...(checks?.length ? { testChecks: checks } : {}),
      ...(options.prApprovalAttestProducer ? { producerAttested: true } : {}),
      ...(options.prApprovalCoverageCheck ? { coverage: { mode: 'check', checkName: options.prApprovalCoverageCheck } } : {}),
    };
  }
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
  if (options.issueWorkflows) {
    const raw = options.issueWorkflows.trim().toLowerCase();
    const requested = raw === 'all' ? [...ISSUE_WORKFLOW_KINDS] : raw.split(',').map(item => item.trim()).filter(Boolean);
    const unknown = requested.filter(item => !ISSUE_WORKFLOW_KINDS.includes(item as IssueWorkflowKind));
    if (unknown.length > 0) throw new Error(`Unknown issue workflow(s): ${unknown.join(', ')}.`);
    if (new Set(requested).size !== requested.length) throw new Error('Issue workflow selection cannot contain duplicates.');
    fromFlags.issueWorkflows = { enabled: requested as IssueWorkflowKind[] };
  }
  if (options.agentGuidance) {
    const mode = options.agentGuidance.trim().toLowerCase();
    if (!['prompt', 'create-if-missing', 'disabled'].includes(mode)) throw new Error('--agent-guidance must be prompt, create-if-missing, or disabled.');
    fromFlags.repositoryAgentGuidance = { agentsPointer: mode as 'prompt' | 'create-if-missing' | 'disabled', enabled: mode !== 'disabled' };
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
    pullRequestApproval: {
      ...fileOverrides.pullRequestApproval,
      ...flagOverrides.pullRequestApproval,
      coverage: { ...fileOverrides.pullRequestApproval?.coverage, ...flagOverrides.pullRequestApproval?.coverage },
    } as SetupConfigurationOverrides['pullRequestApproval'],
    projects: { ...fileOverrides.projects, ...flagOverrides.projects },
    issueWorkflows: { ...fileOverrides.issueWorkflows, ...flagOverrides.issueWorkflows },
    repositoryAgentGuidance: { ...fileOverrides.repositoryAgentGuidance, ...flagOverrides.repositoryAgentGuidance },
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
