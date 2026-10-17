import type { TerminalDriver } from '../application/ports/setup_terminal_ports';
import type { SetupConfigurationOverrides } from '../application/policies/setup_configuration_policy';
import type { SetupBatchPlan, SetupBatchOperation, SetupBatchTarget, SetupBatchGrant } from '../domain/setup_batch';
import { SelectSetupBatchTargetsUseCase } from '../application/usecases/setup/select_setup_batch_targets_use_case';
import { PrepareSetupBatchUseCase } from '../application/usecases/setup/prepare_setup_batch_use_case';
import { ConfigureSetupBatchTargetUseCase } from '../application/usecases/setup/configure_setup_batch_target_use_case';
import { ApplySetupBatchUseCase } from '../application/usecases/setup/apply_setup_batch_use_case';
import type { SetupBatchPresentationPort } from '../application/ports/setup_batch_ports';
import { SetupBatchSessionUseCase } from '../application/usecases/setup/setup_batch_session_use_case';
import { SetupQuestionnaireController, SetupWizardUseCase } from '../application/usecases/setup';
import { AuditConfiguredSetupPatUseCase } from '../application/usecases/setup/audit_configured_setup_pat_use_case';
import { planSetupBatchSharedAccess } from '../application/policies/setup_batch_access_policy';
import { buildSetupBatchView } from '../application/policies/setup_batch_view_policy';
import { buildSetupBatchPatPermissionRequirements } from '../application/policies/setup_token_permission_policy';
import { buildSetupPatCreationUrl } from '../application/policies/setup_pat_creation_url_policy';
import { createDefaultSetupConfiguration } from '../application/policies/setup_configuration_defaults';
import { SetupInteractionCancelledError } from '../application/errors/setup_interaction_cancelled_error';
import { createSetupBatchCompositionRoot } from '../infrastructure/composition/setup_batch_composition_root';
import { createSetupCredentialsUseCase, createSetupRemoteConfigurationReadPort } from '../infrastructure/composition/setup_credentials_composition_root';
import { createSetupTokenPermissionsUseCase } from '../infrastructure/composition/setup_token_permissions_composition_root';
import { createSetupMergeQueueReadinessUseCase } from '../infrastructure/composition/setup_doctor_composition_root';
import { GithubSetupApprovalReadinessAdapter } from '../infrastructure/setup_approval_readiness_adapter';
import { GithubSetupApprovalCheckDiscoveryAdapter } from '../infrastructure/github_setup_approval_check_discovery_adapter';
import { GithubSetupProjectDiscoveryAdapter } from '../infrastructure/github_setup_project_discovery_adapter';
import { SetupCredentialPromptAdapter } from './setup_credential_prompt_adapter';
import { ConsoleSetupTokenPermissionPresenter } from './setup_token_permission_presenter';
import { ConsoleSetupQuestionRenderer } from './setup_question_renderer';
import { ConsoleSetupPlanPresenter } from './setup_plan_presenter';
import { SetupPlanConfirmationAdapter } from './setup_confirmation_adapter';
import { WebSetupCredentialPrompt, WebSetupPermissionPresenter, WebSetupPlanConfirmation,
  WebSetupPlanPresenter, WebSetupQuestionnaireCollector } from './web_setup_adapters';
import type { WebSetupBridge } from './web_setup_bridge';
import type { SetupTokenPermissionRequirement, SetupTokenPermissionReport } from '../domain/setup_token_permissions';
import type { SetupJourneyStage } from '../application/policies/setup_journey_policy';
import { logInfo } from '../utils/logger';

interface BatchInput {
  readonly resumeOperationId?: string;
  readonly owner: string; readonly repository: string; readonly token: string;
  readonly configurationSource: 'organization' | 'customize'; readonly presentationMode: 'basic' | 'custom';
  readonly overrides: SetupConfigurationOverrides; readonly skipVariables: boolean; readonly skipSecrets: boolean;
  readonly provisionalRequirements: readonly SetupTokenPermissionRequirement[];
  readonly terminal?: TerminalDriver; readonly bridge?: WebSetupBridge;
  readonly credentialPrompt: SetupCredentialPromptAdapter | WebSetupCredentialPrompt;
  readonly permissionPresenter: ConsoleSetupTokenPermissionPresenter | WebSetupPermissionPresenter;
  readonly present: (stage: SetupJourneyStage) => void;
  readonly possibleMutation: () => void;
}

/** Presentation and composition only; shared application use cases own selection, configuration and Apply. */
export async function executeSetupBatch(input: BatchInput) {
  const composition = createSetupBatchCompositionRoot();
  const remoteReader = createSetupRemoteConfigurationReadPort();
  const tokenPermissions = createSetupTokenPermissionsUseCase(input.permissionPresenter);
  let approvedGeneration: number | undefined;
  let currentPlan: SetupBatchPlan | undefined;
  let currentOperation: SetupBatchOperation | undefined;
  let retryRemaining = 1;
  let failedPermissionReport: SetupTokenPermissionReport | undefined;
  const alive = () => !input.bridge?.snapshot().outcome;
  const approved = () => alive() && !input.bridge?.snapshot().batch?.stopRequested
    && (approvedGeneration === undefined || approvedGeneration === input.bridge?.controllerGeneration());
  const readText = async (prompt: string): Promise<string> => {
    const result = await input.terminal?.readText(prompt);
    if (!result || result.kind !== 'value') throw new SetupInteractionCancelledError();
    return result.value.trim();
  };
  const audit = (target: SetupBatchTarget, token: string, grants: readonly SetupBatchGrant[] = []) => new AuditConfiguredSetupPatUseCase({
    owner: target.owner, repository: target.name, token, configurationSource: 'organization', deliveryMode: 'pull-request',
    installationGrants: grants, provisionalRequirements: input.provisionalRequirements, assertedOwnerKind: 'Organization',
    guided: input.credentialPrompt.usedGuidedSetupPat,
  }, { permissions: tokenPermissions, presenter: input.permissionPresenter,
    confirmUnverifiable: report => input.credentialPrompt.confirmUnverifiableTokenPermissions(report),
    showOwnerMismatch: () => logInfo('The authenticated organization differs from the reviewed owner. Stop and inspect the target.'),
    showExcessGrants: grants => logInfo(`The reviewed plan no longer needs: ${grants.join(', ')}.`),
    showUpdatedLink: (url, grants) => input.credentialPrompt.showUpdatedSetupPatLink(url, 'final', grants),
  });
  const selection = new SelectSetupBatchTargetsUseCase({ discovery: composition.discovery, active: alive,
    choose: async view => {
      input.present('plan');
      if (input.bridge) return input.bridge.ask({ kind: 'repositories', title: 'Select repositories', selection: view });
      logInfo('Select 1–25 repositories by ID. Discovery shows only repositories this PAT can access; there is no implicit all-repositories selection.');
      if (view.discoveryStatus === 'unavailable' || view.truncated || view.message) logInfo('Discovery is limited or needs attention. Use name:<repository> to inspect an exact name, or access to replace the temporary PAT.');
      view.candidates.forEach(candidate => logInfo(`  ${candidate.id} — ${candidate.name}${candidate.unavailable ? ` (${candidate.unavailable})` : ''}`));
      const value = await readText(`Selected: ${view.selectedIds.join(', ') || 'none'}. Enter IDs, confirm to keep this selection, name:<repository>, access, or cancel: `);
      if (value === 'cancel') return undefined;
      if (value === 'access') return JSON.stringify({ action: 'access', selectedIds: view.selectedIds });
      if (value.startsWith('name:')) return JSON.stringify({ action: 'resolve', selectedIds: view.selectedIds, name: value.slice(5).trim() });
      const ids = value === 'confirm' ? view.selectedIds : value ? value.split(',').map(id => Number(id.trim())) : [];
      return JSON.stringify({ action: 'select', selectedIds: ids });
    },
    requestToken: async repositories => {
      const requirements = buildSetupBatchPatPermissionRequirements(createDefaultSetupConfiguration());
      input.permissionPresenter.showDetailedRequirements('setup', requirements);
      const link = buildSetupPatCreationUrl({ owner: input.owner, repository: input.repository, role: 'setup', expiresIn: 1, requirements });
      if (input.bridge) return input.bridge.ask({ kind: 'secret', title: 'Temporary PAT for selected repositories', optional: true,
        link, copyId: 'batch.token', copyValues: { repositories: repositories.join(', ') || input.repository } });
      logInfo(`Create a temporary PAT limited to ${repositories.join(', ') || input.repository}. ${link}`);
      const value = await input.terminal?.readSecret('Replacement temporary setup PAT (blank keeps the current PAT)');
      if (!value || value.kind !== 'value') throw new SetupInteractionCancelledError();
      return value.value.trim() || undefined;
    },
  });
  const prepare = new PrepareSetupBatchUseCase({ ...composition, active: alive,
    configure: async (target, projected, context) => {
      const privateToken = context.token;
      input.bridge?.setRepository(`${target.owner}/${target.name}`);
      logInfo(`Preparing ${target.owner}/${target.name}. Installation waits for the final batch review.`);
      const wizard = new SetupWizardUseCase({
        collector: input.bridge ? new WebSetupQuestionnaireCollector(input.bridge)
          : new SetupQuestionnaireController(input.terminal!, new ConsoleSetupQuestionRenderer()),
        planPresenter: input.bridge ? new WebSetupPlanPresenter(input.bridge) : new ConsoleSetupPlanPresenter(),
        confirmation: input.bridge ? new WebSetupPlanConfirmation(input.bridge) : new SetupPlanConfirmationAdapter(input.terminal, false),
        finalPermissionAudit: audit(target, privateToken), remoteConfiguration: { inspect: async () => projected,
          inspectCredentialHealthWorkflow: (...args) => remoteReader.inspectCredentialHealthWorkflow!(...args) },
        mergeQueueReadiness: createSetupMergeQueueReadinessUseCase(), approvalReadiness: new GithubSetupApprovalReadinessAdapter(),
        approvalCheckDiscovery: new GithubSetupApprovalCheckDiscoveryAdapter(), projectDiscovery: new GithubSetupProjectDiscoveryAdapter(),
        sessionLiveness: () => alive() ? 'active' : 'cancelled',
      });
      return new ConfigureSetupBatchTargetUseCase({ wizard, credentials: createSetupCredentialsUseCase(input.credentialPrompt,
        input.permissionPresenter, { configurationSource: 'organization', allowPreApplyHealthWorkflow: false }) }).execute({
        target, remote: projected, actualRemote: context.remote, shared: context.shared, token: privateToken,
        configurationSource: input.configurationSource, overrides: input.overrides, presentationMode: input.presentationMode,
        skipVariables: input.skipVariables, skipSecrets: input.skipSecrets });
    },
  });
  const presentation: SetupBatchPresentationPort = { active: approved,
      review: async (plan, operation) => {
        currentPlan = plan; currentOperation = operation;
        input.present('apply'); input.bridge?.setRepository(`${input.owner}/${input.repository}`);
        const view = buildSetupBatchView(plan, operation, 'review', retryRemaining);
        input.bridge?.setBatch(view);
        let answer: string | undefined;
        if (input.bridge) answer = await input.bridge.ask({ kind: 'batch-plan', title: 'Review setup plans', batch: view });
        else {
          printBatch(plan, operation);
          answer = await readText('Apply the ready plans? This checks Write permissions with temporary resources, then creates reviewed setup PRs. Shared values stay unchanged; no merge, tag, release or deploy. Type apply to continue: ');
        }
        const accepted = answer === 'approve' || answer === 'apply';
        if (accepted) approvedGeneration = input.bridge?.controllerGeneration();
        return accepted;
      },
      progress: operation => {
        currentOperation = operation;
        if (currentPlan) input.bridge?.setBatch(buildSetupBatchView(currentPlan, operation, 'applying', retryRemaining));
        logInfo(operation.targets.map(target => `${target.repository}: ${target.status}`).join(' · '));
      },
  };
  const apply = new ApplySetupBatchUseCase({ writer: composition.writer, journal: composition.journal,
    presentation: { active: approved, progress: operation => presentation.progress(operation), review: async () => approved() } });
  const session = new SetupBatchSessionUseCase({ selection, prepare, writer: composition.writer, journal: composition.journal,
    sessionActive: alive, planning: () => input.present('plan'),
    possibleMutation: () => {
      input.present('apply'); input.possibleMutation();
      if (currentPlan && currentOperation) input.bridge?.setBatch(buildSetupBatchView(currentPlan, currentOperation, 'applying', retryRemaining));
    },
    audit: async (plan, token) => {
      const access = planSetupBatchSharedAccess(plan.configuration, plan.target, plan.remote, plan.sharedSnapshot);
      const report = await audit(plan.target, token, plan.grants).audit(plan.configuration, access.projected, input.possibleMutation);
      if (report.status === 'blocked') {
        failedPermissionReport = input.bridge?.snapshot().permissions?.report;
        input.bridge?.resultReason('permissions');
      }
      return { ready: report.status === 'accepted', cleanupPending: report.status === 'blocked' && report.cleanupPending === true };
    },
    presentation, apply,
    result: async (plan, operation, remaining) => {
      retryRemaining = remaining;
      const view = buildSetupBatchView(plan, operation, 'result', remaining);
      input.bridge?.setBatch(view);
      if (input.bridge) return await input.bridge.ask({ kind: 'batch-result', title: 'Setup results', batch: view }) === 'retry' ? 'retry' : 'finish';
      printBatch(plan, operation);
      if (remaining > 0 && operation.targets.some(target => ['partial', 'cancelled', 'applying'].includes(target.status))) {
        return await readText('Inspect existing effects and retry unfinished work? Type retry, or Enter to finish: ') === 'retry' ? 'retry' : 'finish';
      }
      return 'finish';
    },
  });
  const result = await session.execute({ organization: input.owner, currentRepository: input.repository, token: input.token, resumeOperationId: input.resumeOperationId });
  if (currentPlan) input.bridge?.setBatch(buildSetupBatchView(currentPlan, result.operation, 'result', 0));
  if (failedPermissionReport) { input.bridge?.report(failedPermissionReport); input.bridge?.resultReason('permissions'); }
  return result;
}
function printBatch(plan: SetupBatchPlan, operation: SetupBatchOperation): void {
  logInfo(`Setup operation ${plan.operationId}`);
  plan.targets.forEach((target, index) => {
    const receipt = operation.targets[index];
    logInfo(`  ${target.target.owner}/${target.target.name}: ${receipt.status}; ${target.files.length} files, ${target.repositoryVariables.length} repository Variables, ${target.grants.length} additive grants.`);
    logInfo(`  setup/copilot/${plan.operationId} → ${target.target.defaultBranch} at ${target.target.baseSha}`);
    if (target.blocked.length) logInfo(`  Needs attention: ${target.blocked.join(' ')}`);
    if (receipt.cleanupPending) logInfo('  Permission-check cleanup could not be confirmed. Pending work is stopped. Inspect GitHub history and the local recovery journal; resolve cleanup before starting a fresh setup. This operation cannot resume writes.');
    if (!target.blocked.length) buildSetupBatchPatPermissionRequirements(target.configuration, target.remote, target.grants)
      .filter(requirement => requirement.level === 'write' && requirement.applicability === 'required')
      .forEach(requirement => logInfo(`  Temporary permission check: ${requirement.scope} ${requirement.permission} — create, inspect, remove.`));
    if (receipt.pullRequestNumber) logInfo(`  https://github.com/${target.target.owner}/${target.target.name}/pull/${receipt.pullRequestNumber}`);
  });
}
