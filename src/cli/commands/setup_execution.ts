import { runLocalAction } from '../../actions/local_action';
import { getSetupToken } from '../../utils/setup_files';
import { logError, logInfo } from '../../utils/logger';
import { getCurrentAttachedBranch, getCurrentHeadSha, getGitInfo, getGitRepositoryRoot, hasLocalOrTrackedGitBranch, isGitRepositoryRoot, isInsideGitRepo } from '../../cli_context';
import { buildSetupParams } from './setup_policy';
import { loadSetupOverrides, type SetupCommandOverrideOptions } from '../setup_command_options';
import { SetupQuestionnaireController, SetupWizardUseCase } from '../../application/usecases/setup';
import { SetupSessionCoordinator, type SetupSessionDecision } from '../../application/usecases/setup/setup_session_coordinator';
import { setupPlanGuardPaths } from '../../application/policies/setup_configuration_plan';
import { collectSetupPatIntent } from '../setup_pat_intent_adapter';
import { AuditConfiguredSetupPatUseCase } from '../../application/usecases/setup/audit_configured_setup_pat_use_case';
import { VerifySetupPatBootstrapUseCase } from '../../application/usecases/setup/verify_setup_pat_bootstrap_use_case';
import { effectiveIssueWorkflowFeatures } from '../../application/policies/setup_configuration_policy';
import { buildSetupPatPermissionRequirements } from '../../application/policies/setup_token_permission_policy';
import { createSetupRemoteConfigurationReadPort } from '../../infrastructure/composition/setup_credentials_composition_root';
import { collectSetupCredentials } from '../setup_credential_collection';
import { ResolveSetupWorkflowPatConflictUseCase } from '../../application/usecases/setup/resolve_setup_workflow_pat_conflict_use_case';
import { createSetupDoctorUseCase, createSetupMergeQueueReadinessUseCase } from '../../infrastructure/composition/setup_doctor_composition_root';
import { SetupDoctorWorkspaceQueryAdapter } from '../../infrastructure/setup_workspace_adapter';
import { GithubSetupApprovalReadinessAdapter } from '../../infrastructure/setup_approval_readiness_adapter';
import { GithubSetupApprovalCheckDiscoveryAdapter } from '../../infrastructure/github_setup_approval_check_discovery_adapter';
import { GithubSetupProjectDiscoveryAdapter } from '../../infrastructure/github_setup_project_discovery_adapter';
import type { SetupConfiguration, SetupCredentialCollection, SetupRemoteConfiguration } from '../../domain/setup';
import type { SetupConfigurationOverrides } from '../../application/policies/setup_configuration_policy';
import { ApplicationError } from '../../application/errors/application_error';
import { createInteractiveTerminalDriver } from '../setup_terminal_driver';
import { ConsoleSetupQuestionRenderer } from '../setup_question_renderer';
import { ConsoleSetupPlanPresenter } from '../setup_plan_presenter';
import { DryRunSetupPlanConfirmation, SetupPlanConfirmationAdapter } from '../setup_confirmation_adapter';
import { SetupCredentialPromptAdapter, SetupTerminalCancelledError } from '../setup_credential_prompt_adapter';
import { SetupWorkflowUpdatePromptAdapter } from '../setup_workflow_update_prompt_adapter';
import { ConsoleSetupTokenPermissionPresenter } from '../setup_token_permission_presenter';
import { createSetupTokenPermissionsUseCase } from '../../infrastructure/composition/setup_token_permissions_composition_root';
import { authorizeWebSetupApply } from '../setup_apply_authorization';
import { SetupJourneyUseCase } from '../../application/usecases/setup/setup_journey_use_case';
import { buildSetupJourneyView } from '../../application/policies/setup_journey_policy';
import { ConsoleSetupJourneyPresenter } from '../setup_journey_presenter';
import { WebSetupBridge } from '../web_setup_bridge';
import { captureSetupApplySnapshot } from '../setup_apply_snapshot';
import { acquireSetupSessionGuard } from '../setup_session_guard';
import { startWebSetupServer, openWebSetupBrowser, type WebSetupServer } from '../web_setup_server';
import {
  WebSetupCredentialPrompt, WebSetupJourneyPresenter, WebSetupPermissionPresenter,
  WebSetupPlanConfirmation, WebSetupPlanPresenter, WebSetupQuestionnaireCollector,
  WebSetupWorkflowUpdatePrompt,
} from '../web_setup_adapters';
import { setupActionResultFailure, setupResultEffects } from '../setup_result_receipt';
import { reportSetupFailure, finishWebSetupSession } from '../setup_outcome_adapter';
import { manageWebSetup } from '../setup_management_adapter';

export interface SetupExecutionOptions extends SetupCommandOverrideOptions {
  debug?: boolean; token?: string; workflowPat?: string; secret?: Record<string, string>;
  nonInteractive?: boolean; web?: boolean; yes?: boolean; dryRun?: boolean;
  skipSecrets?: boolean; skipVariables?: boolean; updateWorkflows?: boolean;
  confirmUnverifiableWritePermissions?: boolean;
}

export async function executeSetupCommand(options: SetupExecutionOptions): Promise<void> {
      const terminal = options.nonInteractive || options.web ? undefined : createInteractiveTerminalDriver();
      const webBridge = options.web ? new WebSetupBridge('Resolving repository…') : undefined;
      let webServer: WebSetupServer | undefined;
      const credentialPrompt = webBridge ? new WebSetupCredentialPrompt(webBridge) : new SetupCredentialPromptAdapter(terminal, {
        ...(options.workflowPat ? { PAT: options.workflowPat } : {}),
        ...options.secret,
      }, Boolean(options.confirmUnverifiableWritePermissions));
      const permissionPresenter = webBridge ? new WebSetupPermissionPresenter(webBridge)
        : new ConsoleSetupTokenPermissionPresenter(options.nonInteractive ? 'full' : 'summary');
      const tokenPermissions = createSetupTokenPermissionsUseCase(permissionPresenter);
      const workflowPrompt = webBridge ? new WebSetupWorkflowUpdatePrompt(webBridge) : new SetupWorkflowUpdatePromptAdapter(terminal);
      const cwd = process.cwd();
      let setupMutationStarted = false;
      let setupApplyStarted = false;
      let releaseSetupGuard: (() => void) | undefined;
      let journey: SetupJourneyUseCase | undefined;
      let gitInfo!: { owner: string; repo: string };
      let checkoutRoot = cwd;
      let initialBranch: string | undefined;
      let initialHead: string | undefined;
      let overrides!: SetupConfigurationOverrides;
      let presentationMode: 'basic' | 'custom' = 'custom';
      let setupPatPermissions = buildSetupPatPermissionRequirements();
      let token: string | undefined;
      let setupPatAccount: string | undefined;
      let permissionIntent: { draft: SetupConfiguration; answeredQuestionIds: readonly string[]; projectsWanted: boolean } | undefined;
      let assertedOwnerKind: 'Organization' | 'User' | undefined;
      let auditConfiguredSetupPat!: AuditConfiguredSetupPatUseCase;
      let remoteConfigurationReader!: ReturnType<typeof createSetupRemoteConfigurationReadPort>;
      let configuration!: SetupConfiguration;
      let remoteConfiguration: SetupRemoteConfiguration | undefined;
      let guardedFiles: ReturnType<typeof setupPlanGuardPaths> | undefined;
      let webApplySnapshot: ReturnType<typeof captureSetupApplySnapshot> | undefined;
      let approvedWorkflowFiles: string[] = [];
      let credentialsCollection: SetupCredentialCollection | undefined;
      try {
        if (options.confirmUnverifiableWritePermissions) {
          throw new ApplicationError('configuration.invalid',
            '--confirm-unverifiable-write-permissions is no longer accepted. Setup tests Write capabilities with temporary resources during PAT verification.');
        }
        const session = new SetupSessionCoordinator({
          ...(webBridge && !options.dryRun ? { manage: async (possibleMutation: () => void, record: (effect: import('../../domain/setup').SetupOperationEffect) => void) => {
            const result = await manageWebSetup(webBridge, checkoutRoot, gitInfo.owner, gitInfo.repo, () => {
              setupMutationStarted = true; setupApplyStarted = true; possibleMutation();
            }, record, Boolean(options.skipVariables));
            if (result === 'continue') journey = new SetupJourneyUseCase(`${gitInfo.owner}/${gitInfo.repo}`,
              new WebSetupJourneyPresenter(webBridge), setupMutationStarted);
            return result;
          } } : {}),
          repository: async (): Promise<SetupSessionDecision> => {
        if (options.web && (options.nonInteractive || options.yes || options.token || options.workflowPat
          || Object.keys(options.secret ?? {}).length || options.confirmUnverifiableWritePermissions)) {
          throw new ApplicationError('configuration.invalid', '--web cannot be combined with --non-interactive, --yes, --token, --workflow-pat, --secret, or --confirm-unverifiable-write-permissions. Use the browser for these decisions or run copilot setup in the terminal.');
        }
        logInfo('🔍 Checking we are inside a git repository...');
        if (!isInsideGitRepo(cwd)) {
          logError('❌ Not a git repository. Run "copilot setup" from the root of a git repo.');
          process.exitCode = 1;
          return 'blocked';
        }
        logInfo('✅ Git repository detected.');
        logInfo('🔗 Resolving repository (owner/repo)...');
        const resolvedGitInfo = getGitInfo();
        if ('error' in resolvedGitInfo) {
          logError(resolvedGitInfo.error);
          process.exitCode = 1;
          return 'blocked';
        }
        gitInfo = resolvedGitInfo;
        logInfo(`📦 Repository: ${gitInfo.owner}/${gitInfo.repo}`);
        checkoutRoot = webBridge ? getGitRepositoryRoot(cwd) : cwd;
        if (webBridge && !isGitRepositoryRoot(cwd)) {
          throw new ApplicationError('configuration.invalid', `Web setup must start from the repository root (${checkoutRoot}). Change to that directory and rerun before creating PATs. No local setup session started.`);
        }
        releaseSetupGuard = acquireSetupSessionGuard(cwd);
        initialBranch = webBridge ? getCurrentAttachedBranch(cwd) : undefined;
        initialHead = webBridge ? getCurrentHeadSha() : undefined;
        if (webBridge && (!initialBranch || !initialHead)) {
          throw new ApplicationError('configuration.invalid', 'An attached Git branch and revision are required for web setup. Check out a branch before creating PATs. No local setup session started.');
        }
        if (webBridge) {
          webBridge.setRepository(`${gitInfo.owner}/${gitInfo.repo}`);
          webBridge.setJourney(buildSetupJourneyView(`${gitInfo.owner}/${gitInfo.repo}`, 'repository', false));
          webServer = await startWebSetupServer(webBridge);
          logInfo(`🌐 Local setup assistant: ${webServer.url}`);
          logInfo(`🔑 Browser pairing code: ${webServer.pairingCode}`, false, undefined, true);
          logInfo('If the browser does not open, copy this URL into a browser on this computer, then enter the pairing code shown above. The terminal setup remains available with copilot setup.');
          openWebSetupBrowser(webServer.url);
        }
        if (!options.nonInteractive) {
          journey = new SetupJourneyUseCase(`${gitInfo.owner}/${gitInfo.repo}`,
            webBridge ? new WebSetupJourneyPresenter(webBridge) : new ConsoleSetupJourneyPresenter());
          if (webBridge) {
            const target = await webBridge.ask({ kind: 'confirm', title: 'Confirm this repository', copyId: 'repository.confirm', copyValues: { repository: `${gitInfo.owner}/${gitInfo.repo}`, branch: initialBranch ?? '' },
              description: `This local checkout resolves to ${gitInfo.owner}/${gitInfo.repo} on branch ${initialBranch}. Confirm the target before configuring PAT access or files.`,
              choices: ['Yes, this is my repository', 'Stop and choose another checkout'] });
            if (target === undefined) throw new SetupTerminalCancelledError();
            if (target !== 'Yes, this is my repository') return 'cancelled';
          }
        }
        return 'continue';
          },
          choices: async (): Promise<SetupSessionDecision> => {
        overrides = loadSetupOverrides(options);
        if (!options.nonInteractive && !options.dryRun) {
          if (webBridge) {
            const depth = await webBridge.ask({ kind: 'choice', title: 'Choose setup detail', copyId: 'setup.depth',
              choices: ['Basic guided setup', 'Customize every setting'], defaultValue: 'Basic guided setup' });
            if (depth === undefined) throw new SetupTerminalCancelledError();
            presentationMode = depth === 'Basic guided setup' ? 'basic' : 'custom';
          } else if (credentialPrompt instanceof SetupCredentialPromptAdapter) {
            presentationMode = await credentialPrompt.chooseSetupPresentationMode();
          }
        }
        token = getSetupToken(cwd, options.token);
        if (webBridge && token) {
          const choice = await webBridge.ask({ kind: 'choice', title: 'An environment setup PAT is available', copyId: 'setup.environmentPat',
            description: 'Its value stays in the CLI process. Continuing starts identity checks and temporary create/read/delete permission tests before planning. Installation requires final approval. Exiting Copilot cannot unset your parent shell variable.',
            choices: ['Use the environment PAT', 'Create or enter a different PAT'] });
          if (choice === undefined) throw new SetupTerminalCancelledError();
          if (choice !== 'Use the environment PAT') token = undefined;
        }
        if (token || options.nonInteractive) permissionPresenter.showDetailedRequirements('setup', setupPatPermissions);
        else permissionPresenter.showRequirements('setup', setupPatPermissions);
        if (!token && !options.nonInteractive && !options.dryRun) {
          const intent = await collectSetupPatIntent({
            owner: gitInfo.owner, repository: gitInfo.repo, overrides,
            skipRepositoryVariables: Boolean(options.skipVariables),
            skipRepositorySecrets: Boolean(options.skipSecrets),
            terminal, bridge: webBridge, journey, credentialPrompt, permissionPresenter,
            initialRequirements: setupPatPermissions,
          });
          setupPatPermissions = [...intent.requirements];
          assertedOwnerKind = intent.assertedOwnerKind;
          permissionIntent = intent.permissionIntent;
        }
        return 'continue';
          },
          setupPat: async (cleanupPending): Promise<SetupSessionDecision> => {
        if (!token && !options.nonInteractive && !options.dryRun) token = await credentialPrompt.requestSetupPat();
        if (!token && !options.dryRun) {
          logError('🛑 Setup requires PERSONAL_ACCESS_TOKEN with a valid token.');
          logInfo('   You can:');
          logInfo('   • Pass it on the command line: copilot setup --token <your_github_token>');
          logInfo('   • Add it to your environment: export PERSONAL_ACCESS_TOKEN=your_github_token');
          process.exitCode = 1;
          return 'blocked';
        }
        if (token) {
          setupPatAccount = await new VerifySetupPatBootstrapUseCase({
            permissions: tokenPermissions,
            presenter: permissionPresenter,
            confirmUnverifiable: report => credentialPrompt.confirmUnverifiableTokenPermissions(report),
            confirmAccount: account => credentialPrompt.confirmGuidedSetupAccount(account),
            showCorrectedLink: url => credentialPrompt.showUpdatedSetupPatLink(url, 'bootstrap'),
          }).execute({ owner: gitInfo.owner, repository: gitInfo.repo, token,
            requirements: setupPatPermissions, guided: credentialPrompt.usedGuidedSetupPat,
            previewOnly: Boolean(options.dryRun),
            onCleanupPending: () => { setupMutationStarted = true; cleanupPending(); } });
        }
        return 'continue';
          },
          plan: async (cleanupPending): Promise<SetupSessionDecision> => {
        logInfo(options.dryRun ? '🧭 Building a dry-run setup plan...' : '🧭 Building your setup plan...');
        auditConfiguredSetupPat = new AuditConfiguredSetupPatUseCase({
          owner: gitInfo.owner, repository: gitInfo.repo, token,
          provisionalRequirements: setupPatPermissions, assertedOwnerKind,
          guided: credentialPrompt.usedGuidedSetupPat,
        }, {
          permissions: tokenPermissions,
          presenter: permissionPresenter,
          confirmUnverifiable: report => credentialPrompt.confirmUnverifiableTokenPermissions(report),
          showOwnerMismatch: (asserted, actual) => logInfo(`The owner was declared ${asserted}, but GitHub reports ${actual}. The guided link is no longer valid for this plan.`),
          showExcessGrants: grants => logInfo(`The final plan no longer requires grants suggested earlier: ${grants.join(', ')}. Your PAT may have excess access; replace it in GitHub if least privilege is required.`),
          showUpdatedLink: (url, grants) => credentialPrompt.showUpdatedSetupPatLink(url, 'final', grants),
        });
        remoteConfigurationReader = createSetupRemoteConfigurationReadPort();
        const wizard = new SetupWizardUseCase({
          ...(terminal || webBridge ? {
            collector: webBridge ? new WebSetupQuestionnaireCollector(webBridge)
              : new SetupQuestionnaireController(terminal!, new ConsoleSetupQuestionRenderer()),
          } : {}),
          planPresenter: webBridge ? new WebSetupPlanPresenter(webBridge) : new ConsoleSetupPlanPresenter(),
          confirmation: options.dryRun
            ? new DryRunSetupPlanConfirmation()
            : webBridge ? new WebSetupPlanConfirmation(webBridge)
              : new SetupPlanConfirmationAdapter(terminal, Boolean(options.yes)),
          finalPermissionAudit: auditConfiguredSetupPat,
          onPermissionCleanupPending: () => { setupMutationStarted = true; cleanupPending(); },
          remoteConfiguration: remoteConfigurationReader,
          workflowPatConflict: new ResolveSetupWorkflowPatConflictUseCase(credentialPrompt, remoteConfigurationReader),
          mergeQueueReadiness: createSetupMergeQueueReadinessUseCase(),
          approvalReadiness: new GithubSetupApprovalReadinessAdapter(),
          approvalCheckDiscovery: new GithubSetupApprovalCheckDiscoveryAdapter(),
          projectDiscovery: new GithubSetupProjectDiscoveryAdapter(),
          ...(webBridge ? { sessionLiveness: () => webBridge.snapshot().outcome === 'cancelled' ? 'cancelled'
            : webBridge.snapshot().outcome ? 'expired' : 'active' } : {}),
        });
        const result = await wizard.execute({
          mode: options.nonInteractive ? 'non-interactive' : 'interactive',
          overrides,
          ...(permissionIntent ? { permissionIntent } : {}),
          skipRepositoryVariables: Boolean(options.skipVariables),
          skipRepositorySecrets: Boolean(options.skipSecrets),
          previewOnly: Boolean(options.dryRun),
          presentationMode,
          developmentBranchObservedLocally: hasLocalOrTrackedGitBranch(cwd, overrides.repository?.developmentBranch ?? 'develop'),
          ...(token ? { remoteTarget: { owner: gitInfo.owner, repository: gitInfo.repo, token } } : {}),
        });
        if (result.status === 'cancelled') {
          if (result.reason !== 'questionnaire-cancelled') {
            logInfo('⏭️  Setup cancelled. No changes were applied.');
          }
          if (result.exitCode !== 0) process.exitCode = result.exitCode;
          return 'cancelled';
        }
        if (result.status === 'blocked') {
          webBridge?.resultReason(result.reason === 'setup-permissions-unavailable' ? 'permissions' : 'storage');
          logError(new ApplicationError(
            result.reason === 'setup-permissions-unavailable' ? 'authorization.credential-invalid' : 'provider.unavailable',
            `${result.reason === 'setup-permissions-unavailable'
              ? 'Setup is blocked by missing or unconfirmed PAT permissions:'
              : 'Setup is blocked by unavailable remote storage:'}\n${result.errors.map(error => `- ${error}`).join('\n')}`,
          ));
          process.exitCode = result.exitCode;
          return 'blocked';
        }
        configuration = result.configuration;
        remoteConfiguration = result.remoteConfiguration;
        guardedFiles = webBridge ? setupPlanGuardPaths(result.plan) : undefined;
        webApplySnapshot = guardedFiles ? captureSetupApplySnapshot(checkoutRoot, guardedFiles) : undefined;
        const workflowComparisons = new SetupDoctorWorkspaceQueryAdapter().compareWorkflows(effectiveIssueWorkflowFeatures(configuration), configuration);
        const updateWorkflows = await workflowPrompt.confirmWorkflowUpdates(workflowComparisons, Boolean(options.updateWorkflows));
        approvedWorkflowFiles = updateWorkflows
          ? workflowComparisons.filter(comparison => comparison.status === 'changed').map(comparison => comparison.file)
          : [];
        if (options.dryRun) {
          logInfo('✅ Dry run complete. No files or GitHub resources were changed.');
          return 'dry-run';
        }
        return 'continue';
          },
          credentials: async (possibleMutation): Promise<SetupSessionDecision> => {
        credentialsCollection = await collectSetupCredentials({
          owner: gitInfo.owner, repository: gitInfo.repo, setupToken: token ?? '',
          setupPatAccount, configuration, remoteConfiguration,
          skipSecrets: Boolean(options.skipSecrets), nonInteractive: Boolean(options.nonInteractive),
          workflowPat: options.workflowPat, secret: options.secret, bridge: webBridge,
          prompt: credentialPrompt, permissionPresenter,
          possibleMutation: () => { setupMutationStarted = true; possibleMutation(); },
        });
        return 'continue';
          },
          authorizeApply: async (cleanupPending): Promise<SetupSessionDecision> => {
        if (webBridge) return authorizeWebSetupApply({
          bridge: webBridge, cwd, owner: gitInfo.owner, repository: gitInfo.repo,
          checkoutRoot, initialBranch, initialHead, selectedFiles: guardedFiles,
          fileSnapshot: webApplySnapshot, approvedRemote: remoteConfiguration,
          configuration, setupToken: token, remoteReader: remoteConfigurationReader,
          permissionAudit: auditConfiguredSetupPat,
          onPermissionCleanupPending: () => { setupMutationStarted = true; cleanupPending(); },
        });
        return 'continue';
          },
          apply: async report => {
        logInfo('⚙️  Applying the approved setup plan...');
        const params = buildSetupParams(
          options,
          gitInfo,
          token ?? '',
          configuration,
          credentialsCollection,
          approvedWorkflowFiles,
          remoteConfiguration,
        );
        setupMutationStarted = true;
        setupApplyStarted = true;
        const actionResults = await runLocalAction(params, {
          onSetupProgress: effect => { report(effect); webBridge?.progress(effect); },
        });
        webBridge?.effects(setupResultEffects(actionResults));
        if (actionResults.length === 0 || actionResults.some(actionResult => !actionResult.success || actionResult.errors.length > 0)) {
          const failure = setupActionResultFailure(actionResults);
          if (failure) webBridge?.resultReason(failure.reasonCode, failure.diagnosticRef);
          logInfo('Setup reported failures or partial completion. If a bot PAT was supplied, its Secret may already have been written; inspect the result and GitHub Secret name/scope before retrying or revoking it.');
          process.exitCode = 1;
        } else {
          if (webBridge && token) {
            const doctorToken = token;
            webBridge.configureReadOnlyDoctor(async () => {
              const diagnosis = await createSetupDoctorUseCase().execute({ owner: gitInfo.owner,
                repository: gitInfo.repo, setupToken: doctorToken, configuration, readOnly: true });
              return { healthy: diagnosis.report.healthy, ...diagnosis.report.totals };
            });
          }
        }
        return { success: actionResults.length > 0 && actionResults.every(actionResult => actionResult.success && actionResult.errors.length === 0), effects: [] };
          },
          liveness: () => webBridge?.snapshot().outcome === 'cancelled' ? 'cancelled'
            : webBridge?.snapshot().outcome ? 'expired' : 'active',
          present: (stage, mutationStarted, outcome) => {
            if (webBridge?.snapshot().surface === 'management') {
              webBridge.setJourney(buildSetupJourneyView(`${gitInfo.owner}/${gitInfo.repo}`, stage, mutationStarted, outcome));
              return;
            }
            if (!journey) return;
            journey.advance(stage);
            if (mutationStarted && ['plan','credentials','apply'].includes(stage)) journey.markMutationStarted();
            if (outcome) journey.finish(outcome);
          },
          isCancellationError: error => error instanceof SetupTerminalCancelledError,
        });
        const run = await session.execute();
        setupMutationStarted = run.mutationStarted;
        if (run.error !== undefined) throw run.error;
        if (run.outcome === 'blocked' || run.outcome === 'partial') process.exitCode = 1;
      } catch (error) {
        process.exitCode = reportSetupFailure(error, { journey: webBridge?.snapshot().surface === 'management' ? undefined : journey, bridge: webBridge,
          mutationStarted: setupMutationStarted, applyStarted: setupApplyStarted,
          guidedBotIdentity: Boolean(credentialPrompt.guidedWorkflowBotIdentity) });
      } finally {
        credentialPrompt.showSetupPatCleanupReminder();
        terminal?.close();
        await finishWebSetupSession(webBridge, webServer, process.exitCode);
        releaseSetupGuard?.();
      }

}
