import { Command } from 'commander';
import { runLocalAction } from '../../actions/local_action';
import { TITLE } from '../../application/contracts/product_identity';
import { getSetupToken } from '../../utils/setup_files';
import { logError, logInfo } from '../../utils/logger';
import { getCurrentBranch, getCurrentHeadSha, getGitInfo, getGitRepositoryRoot, isInsideGitRepo } from '../../cli_context';
import { buildSetupParams } from './setup_policy';
import { collectApprovalCheck, collectScope, collectSecret, loadSetupOverrides } from '../setup_command_options';
import { SetupQuestionnaireController, SetupWizardUseCase } from '../../application/usecases/setup';
import { setupPlanGuardPaths } from '../../application/policies/setup_configuration_plan';
import { PrepareSetupPatIntentUseCase } from '../../application/usecases/setup/prepare_setup_pat_intent_use_case';
import { AuditConfiguredSetupPatUseCase } from '../../application/usecases/setup/audit_configured_setup_pat_use_case';
import { VerifySetupPatBootstrapUseCase } from '../../application/usecases/setup/verify_setup_pat_bootstrap_use_case';
import { buildSetupCredentialRequirements, effectiveIssueWorkflowFeatures } from '../../application/policies/setup_configuration_policy';
import {
  buildSetupPatPermissionRequirements,
  buildWorkflowPatPermissionRequirements,
} from '../../application/policies/setup_token_permission_policy';
import { createSetupCredentialsUseCase, createSetupRemoteConfigurationReadPort } from '../../infrastructure/composition/setup_credentials_composition_root';
import { createSetupMergeQueueReadinessUseCase } from '../../infrastructure/composition/setup_doctor_composition_root';
import { SetupDoctorWorkspaceQueryAdapter } from '../../infrastructure/setup_workspace_adapter';
import { GithubSetupApprovalReadinessAdapter } from '../../infrastructure/setup_approval_readiness_adapter';
import type { SetupConfiguration } from '../../domain/setup';
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
import { VerifyWebSetupApplyUseCase } from '../../application/usecases/setup/verify_web_setup_apply_use_case';
import { SetupJourneyUseCase } from '../../application/usecases/setup/setup_journey_use_case';
import { buildSetupJourneyView } from '../../application/policies/setup_journey_policy';
import { ConsoleSetupJourneyPresenter } from '../setup_journey_presenter';
import { WebSetupBridge } from '../web_setup_bridge';
import { captureSetupApplySnapshot, setupApplySnapshotMatches } from '../setup_apply_snapshot';
import { acquireSetupSessionGuard } from '../setup_session_guard';
import { startWebSetupServer, openWebSetupBrowser, type WebSetupServer } from '../web_setup_server';
import {
  WebSetupCredentialPrompt, WebSetupJourneyPresenter, WebSetupPermissionPresenter,
  WebSetupPlanConfirmation, WebSetupPlanPresenter, WebSetupQuestionnaireCollector,
  WebSetupWorkflowUpdatePrompt,
} from '../web_setup_adapters';

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
    .option('--web', 'Run the optional local browser setup assistant (127.0.0.1 only)', false)
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
      const terminal = options.nonInteractive || options.web ? undefined : createInteractiveTerminalDriver();
      const webBridge = options.web ? new WebSetupBridge('Resolving repository…') : undefined;
      let webServer: WebSetupServer | undefined;
      const credentialPrompt = webBridge ? new WebSetupCredentialPrompt(webBridge) : new SetupCredentialPromptAdapter(terminal, {
        ...(options.workflowPat ? { PAT: options.workflowPat } : {}),
        ...options.secret,
      }, Boolean(options.confirmUnverifiableWritePermissions));
      const permissionPresenter = webBridge ? new WebSetupPermissionPresenter(webBridge)
        : new ConsoleSetupTokenPermissionPresenter(options.nonInteractive ? 'full' : 'summary');
      const tokenPermissions = createSetupTokenPermissionsUseCase();
      const workflowPrompt = webBridge ? new WebSetupWorkflowUpdatePrompt(webBridge) : new SetupWorkflowUpdatePromptAdapter(terminal);
      const cwd = process.cwd();
      let setupMutationStarted = false;
      let releaseSetupGuard: (() => void) | undefined;
      let journey: SetupJourneyUseCase | undefined;
      try {
        if (options.web && (options.nonInteractive || options.yes || options.token || options.workflowPat
          || Object.keys(options.secret ?? {}).length || options.confirmUnverifiableWritePermissions)) {
          throw new ApplicationError('configuration.invalid', '--web cannot be combined with --non-interactive, --yes, --token, --workflow-pat, --secret, or --confirm-unverifiable-write-permissions. Use the browser for these decisions or run copilot setup in the terminal.');
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
        releaseSetupGuard = acquireSetupSessionGuard(cwd);
        const checkoutRoot = webBridge ? getGitRepositoryRoot(cwd) : cwd;
        const initialBranch = webBridge ? getCurrentBranch() : undefined;
        const initialHead = webBridge ? getCurrentHeadSha() : undefined;
        if (webBridge && !initialHead) {
          throw new ApplicationError('configuration.invalid', 'The current Git revision could not be verified. No local setup session started.');
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
            const target = await webBridge.ask({ kind: 'confirm', title: 'Confirm this repository',
              description: `This local checkout resolves to ${gitInfo.owner}/${gitInfo.repo} on branch ${initialBranch}. Confirm the target before configuring PAT access or files.`,
              choices: ['Yes, this is my repository', 'Stop and choose another checkout'] });
            if (target === undefined) throw new SetupTerminalCancelledError();
            if (target !== 'Yes, this is my repository') { journey.finish('cancelled'); return; }
          }
          journey.advance('choices');
        }
        const overrides = loadSetupOverrides(options);
        let setupPatPermissions = buildSetupPatPermissionRequirements();
        let token = getSetupToken(cwd, options.token);
        if (webBridge && token) {
          const choice = await webBridge.ask({ kind: 'choice', title: 'An environment setup PAT is available',
            description: 'Its value stays in the CLI process and is never sent to this page. Exiting Copilot cannot unset your parent shell variable.',
            choices: ['Use the environment PAT', 'Create or enter a different PAT'] });
          if (choice === undefined) throw new SetupTerminalCancelledError();
          if (choice !== 'Use the environment PAT') token = undefined;
        }
        if (token || options.nonInteractive) permissionPresenter.showDetailedRequirements('setup', setupPatPermissions);
        else permissionPresenter.showRequirements('setup', setupPatPermissions);
        let setupPatAccount: string | undefined;
        let permissionIntent: { draft: SetupConfiguration; answeredQuestionIds: readonly string[] } | undefined;
        let assertedOwnerKind: 'Organization' | 'User' | undefined;
        if (!token && !options.nonInteractive && !options.dryRun) {
          if (await credentialPrompt.chooseSetupPatMethod() === 'guided') {
            const prepared = await new PrepareSetupPatIntentUseCase({
              collect: (initial, context, pass) => (webBridge
                ? new WebSetupQuestionnaireCollector(webBridge, pass)
                : new SetupQuestionnaireController(terminal!, new ConsoleSetupQuestionRenderer('permission-intent', pass)))
                .collect(initial, context),
              chooseOwnerKind: () => credentialPrompt.chooseSetupOwnerKind(),
              review: () => credentialPrompt.reviewSetupPatIntent(),
              showPreview: ({ draft, requirements, uncertain, ownerConflict, errors, pass }) => {
                if (ownerConflict) logInfo('This plan selects organization storage or Projects, but the owner was declared a personal account. Revise the choices or use the manual PAT path.');
                if (errors.length) logInfo(`The selected local configuration needs correction before a guided link can be generated:\n${errors.map(item => `  - ${item}`).join('\n')}`);
                if (pass > 1) logInfo('Choice review complete. Returning to setup PAT permission review.');
                logInfo('Permission intent:');
                logInfo(`  Initial tag: ${draft.createInitialTag ? 'yes' : 'no'}; issue workflows: ${draft.features.issues ? draft.issueWorkflows.enabled.join(', ') || 'none' : 'disabled'}; PR approval: ${draft.pullRequestApproval.mode}`);
                logInfo(`  Secrets: ${draft.manageRepositorySecrets ? draft.storage.secrets.defaultScope : 'off'}; Variables: ${draft.manageRepositoryVariables ? draft.storage.variables.defaultScope : 'off'}; Projects: ${draft.projects.ids.trim() || 'none'}`);
                webBridge?.message(`Permission preview: issue workflows ${draft.features.issues ? draft.issueWorkflows.enabled.join(', ') || 'none' : 'disabled'}; PR approval ${draft.pullRequestApproval.mode}; Secrets ${draft.manageRepositorySecrets ? draft.storage.secrets.defaultScope : 'off'}; Variables ${draft.manageRepositoryVariables ? draft.storage.variables.defaultScope : 'off'}; Projects ${draft.projects.ids.trim() || 'none'}.`, 'info');
                permissionPresenter.showRequirements('setup', requirements);
                if (uncertain.length) logInfo(`May need after GitHub inspection:\n${uncertain.map(item => `  - ${item}`).join('\n')}`);
              },
              showDetails: requirements => permissionPresenter.showDetailedRequirements('setup', requirements),
              onManual: reason => {
                if (reason === 'owner-unknown') logInfo('Owner type was not confirmed. Use the manual PAT table, or check whether the GitHub owner is an organization before retrying guided setup.');
                if (reason === 'unsupported') logInfo('A guided setup PAT link is unavailable for this owner or permission set. Enter a manually created PAT using the table above.');
                credentialPrompt.useManualSetupPat();
                permissionPresenter.showDetailedRequirements('setup', setupPatPermissions);
              },
              advanceToSetupPat: () => { journey?.advance('setup-pat'); },
              revisitChoices: () => journey!.revisitChoices(),
            }).execute({
              owner: gitInfo.owner, repository: gitInfo.repo, overrides,
              skipRepositoryVariables: Boolean(options.skipVariables),
              skipRepositorySecrets: Boolean(options.skipSecrets),
            });
            if (prepared.kind === 'guided') {
              credentialPrompt.configureSetupPatGuide(prepared.url);
              setupPatPermissions = [...prepared.requirements];
              assertedOwnerKind = prepared.ownerKind;
              permissionIntent = prepared.permissionIntent;
            }
          } else {
            journey?.advance('setup-pat');
            permissionPresenter.showDetailedRequirements('setup', setupPatPermissions);
          }
        }
        if (options.dryRun && !token && !webBridge) journey?.advance('plan');
        if (!token && !options.dryRun) journey?.advance('setup-pat');
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
          journey?.advance('setup-pat');
          setupPatAccount = await new VerifySetupPatBootstrapUseCase({
            permissions: tokenPermissions,
            presenter: permissionPresenter,
            confirmUnverifiable: report => credentialPrompt.confirmUnverifiableTokenPermissions(report),
            confirmAccount: account => credentialPrompt.confirmGuidedSetupAccount(account),
            showCorrectedLink: url => credentialPrompt.showUpdatedSetupPatLink(url, 'bootstrap'),
          }).execute({ owner: gitInfo.owner, repository: gitInfo.repo, token,
            requirements: setupPatPermissions, guided: credentialPrompt.usedGuidedSetupPat });
          journey?.advance('plan');
        }
        logInfo(options.dryRun ? '🧭 Building a dry-run setup plan...' : '🧭 Building your setup plan...');
        const auditConfiguredSetupPat = new AuditConfiguredSetupPatUseCase({
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
        const remoteConfigurationReader = createSetupRemoteConfigurationReadPort();
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
          journey?.finish('cancelled');
          if (result.reason !== 'questionnaire-cancelled') {
            logInfo('⏭️  Setup cancelled. No changes were applied.');
          }
          if (result.exitCode !== 0) process.exitCode = result.exitCode;
          return;
        }
        if (result.status === 'blocked') {
          journey?.finish('blocked');
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
        const guardedFiles = webBridge ? setupPlanGuardPaths(result.plan) : undefined;
        const webApplySnapshot = guardedFiles ? captureSetupApplySnapshot(checkoutRoot, guardedFiles) : undefined;
        const credentialRequirements = buildSetupCredentialRequirements(configuration);
        const workflowComparisons = new SetupDoctorWorkspaceQueryAdapter().compareWorkflows(effectiveIssueWorkflowFeatures(configuration), configuration);
        const updateWorkflows = await workflowPrompt.confirmWorkflowUpdates(workflowComparisons, Boolean(options.updateWorkflows));
        const approvedWorkflowFiles = updateWorkflows
          ? workflowComparisons.filter(comparison => comparison.status === 'changed').map(comparison => comparison.file)
          : [];
        if (options.dryRun) {
          if (webBridge) journey?.advance('plan');
          journey?.finish('dry-run');
          logInfo('✅ Dry run complete. No files or GitHub resources were changed.');
          return;
        }
        journey?.advance('credentials');
        const workflowTokenPermissions = buildWorkflowPatPermissionRequirements(configuration, remoteConfiguration);
        const githubIdentities = new SetupGithubIdentityQueryAdapter();
        if (!options.nonInteractive && !options.workflowPat && !options.secret?.PAT) {
          try {
            const workflowPatGuide = buildSetupPatCreationUrl({
              role: 'workflow', owner: gitInfo.owner, repository: gitInfo.repo, expiresIn: 90,
              requirements: workflowTokenPermissions,
            });
            credentialPrompt.configureWorkflowPatGuide(workflowPatGuide, login => githubIdentities.resolve(login, token!), workflowTokenPermissions);
          } catch (error) {
            if (!(error instanceof UnsupportedSetupPatLinkError)) throw error;
            logInfo('A guided fine-grained bot PAT link is unavailable for one or more required permissions. Use the permission table and manual path; review whether a classic PAT is required for this plan.');
            permissionPresenter.showDetailedRequirements('workflow', workflowTokenPermissions);
          }
        }
        const credentials = await createSetupCredentialsUseCase(credentialPrompt, permissionPresenter,
          webBridge ? { allowPreApplyHealthWorkflow: false } : undefined).collect({
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
        if (webBridge) {
          if (!remoteConfiguration || !guardedFiles || !webApplySnapshot || !initialBranch || !initialHead || !token) {
            throw new ApplicationError('configuration.invalid', 'The approved setup evidence is incomplete. No mutation started; restart and review a new plan.');
          }
          const authorization = await new VerifyWebSetupApplyUseCase({
            confirm: async () => {
              const answer = await webBridge.ask({ kind: 'confirm', title: 'Apply this setup now?',
                description: 'This is the final approval. Local files and selected GitHub resources may change. A partial result may require inspection before retrying.',
                choices: ['Apply setup', 'Stop without applying'] });
              return answer === undefined ? undefined : answer === 'Apply setup' ? 'apply' : 'stop';
            },
            readRepositoryFacts: () => {
              const current = getGitInfo();
              return 'error' in current ? undefined : {
                owner: current.owner, repository: current.repo, checkoutRoot: getGitRepositoryRoot(cwd),
                branch: getCurrentBranch(), head: getCurrentHeadSha() ?? '',
              };
            },
            fileSnapshotMatches: setupApplySnapshotMatches,
            remote: remoteConfigurationReader,
            permissionAudit: auditConfiguredSetupPat,
            sessionState: () => webBridge.snapshot().outcome === 'cancelled' ? 'cancelled'
              : webBridge.snapshot().outcome ? 'ended' : 'active',
          }).execute({
            repository: { owner: gitInfo.owner, repository: gitInfo.repo, checkoutRoot,
              branch: initialBranch, head: initialHead },
            selectedFiles: guardedFiles, fileSnapshot: webApplySnapshot, approvedRemote: remoteConfiguration,
            configuration, setupToken: token,
          });
          if (authorization === 'cancelled') throw new SetupTerminalCancelledError();
          if (authorization === 'declined') { journey?.finish('cancelled'); return; }
        }
        logInfo('⚙️  Applying the approved setup plan...');
        journey?.advance('apply');
        const params = buildSetupParams(
          options,
          gitInfo,
          token ?? '',
          configuration,
          credentials.collection,
          approvedWorkflowFiles,
          remoteConfiguration,
        );
        if (!params) {
          journey?.finish('blocked');
          return;
        }
        setupMutationStarted = true;
        journey?.markMutationStarted();
        const actionResults = await runLocalAction(params);
        if (actionResults.some(actionResult => !actionResult.success || actionResult.errors.length > 0)) {
          journey?.finish('partial');
          logInfo('Setup reported failures or partial completion. If a bot PAT was supplied, its Secret may already have been written; inspect the result and GitHub Secret name/scope before retrying or revoking it.');
          process.exitCode = 1;
        } else {
          journey?.finish('complete');
        }
      } catch (error) {
        journey?.finish(setupMutationStarted ? 'partial' : error instanceof SetupTerminalCancelledError ? 'cancelled' : 'blocked');
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
        if (webBridge && webServer) {
          const outcome = webBridge.snapshot().journey?.outcome ?? (process.exitCode ? 'blocked' : 'cancelled');
          webBridge.finish(outcome, outcome === 'complete'
            ? 'Setup completed. Delete the temporary setup PAT in GitHub; keep the bot PAT while its Secret is in use.'
            : outcome === 'dry-run' ? 'Dry run complete. No files or GitHub resources changed.'
              : outcome === 'partial' ? 'Setup may be partial. Inspect GitHub resources and run copilot doctor before retrying.'
                : 'No further setup changes will be applied. Any PAT already created in GitHub still exists until you delete it there.');
          logInfo('The local browser page shows the result. Choose “Close local session” there, or stop this command with Ctrl+C.');
          await webServer.closed;
        }
        releaseSetupGuard?.();
      }
    });
}
