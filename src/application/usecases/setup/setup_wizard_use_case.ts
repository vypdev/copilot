import { setupRunnerReadiness, setupRunnerProfileIsFresh } from '../../policies/setup_runner_policy';
import { unavailableSetupRemoteConfiguration, hasCompleteSetupSecretRevisions } from '../../policies/setup_remote_facts_policy';
import type {
  SetupConfigurationCollectorPort,
  SetupPlanConfirmationPort,
  SetupPlanPresenterPort,
} from '../../ports/setup_terminal_ports';
import type {
  SetupFinalPermissionAuditPort,
  SetupMergeQueueReadinessPort,
  SetupRemoteConfigurationReadPort,
} from '../../ports/setup_wizard_ports';
import { ApplicationError } from '../../errors/application_error';
import type { SetupConfiguration, SetupPlan, SetupRemoteConfiguration } from '../../../domain/setup';
import type { SetupQuestion, SetupQuestionnaireContext } from '../../../domain/setup_questionnaire';
import {
  buildSetupCredentialRequirements,
  buildSetupRepositoryVariables,
  buildSetupPlan,
  createDefaultSetupConfiguration,
  mergeSetupConfiguration,
  normalizeSetupConfigurationLocales,
  validateSetupManagedResourceInventory,
  validateSetupStorageAgainstRemote,
  validateSetupConfiguration,
  type SetupConfigurationOverrides,
} from '../../policies/setup_configuration_policy';
import {
  createSetupQuestionnaire,
  createSetupReviewState,
  enterSetupConfirmation,
  finishSetupQuestionnaire,
  setupQuestionIdsForGroup,
  setupBasicSkippedQuestionIds,
  setupQuestionContentInventory,
} from '../../policies/setup_questionnaire_policy';
import { cloneSetupConfiguration } from '../../policies/setup_configuration_clone_policy';
import { resolveStaticSetupDoctorCatalog } from '../../policies/setup_doctor_message_catalog';
import { DEFAULT_PULL_REQUEST_APPROVAL_POLICY } from '../../../domain/pull_request_approval_policy';
import type { SetupApprovalReadinessPort } from '../../ports/setup_approval_readiness_port';
import type { SetupApprovalCheckDiscoveryPort } from '../../ports/setup_approval_check_discovery_port';
import type { SetupProjectDiscoveryPort } from '../../ports/setup_project_discovery_port';
import { validateDiscoveredProjectStatuses } from '../../policies/setup_project_selection_policy';
import { buildConfiguredSetupPatPermissionRequirements, buildSetupOrganizationReusePermissionRequirements, buildSetupBatchPatPermissionRequirements } from '../../policies/setup_token_permission_policy';
import type { DoctorCheck } from '../../../domain/setup';
import type { ResolveSetupWorkflowPatConflictUseCase } from './resolve_setup_workflow_pat_conflict_use_case';
import { setupWorkflowPatStorageNotice } from '../../policies/setup_configuration_storage_policy';
import { importSetupOrganizationConfiguration } from '../../policies/setup_organization_import_policy';
import { setupOrganizationExplicitQuestionIds } from '../../policies/setup_organization_variable_bindings';
import type { SetupOrganizationImportResult } from '../../../domain/setup_organization_reuse';
import { configureSetupOrganizationReuseStorage, buildSetupOrganizationReuseVariables, planSetupOrganizationVariableReuse } from '../../policies/setup_organization_variable_reuse_policy';

export interface SetupWizardRequest {
  mode: 'interactive' | 'non-interactive';
  overrides?: SetupConfigurationOverrides;
  skipRepositoryVariables?: boolean;
  skipRepositorySecrets?: boolean;
  previewOnly?: boolean;
  presentationMode?: 'basic' | 'custom';
  configurationSource?: 'organization' | 'customize';
  deliveryMode?: 'local' | 'pull-request';
  installationGrants?: readonly { readonly kind: 'variable' | 'secret' }[];
  /** Same-session source proposal retained while the user revises a plan group. */
  organizationImportSnapshot?: SetupOrganizationImportResult;
  developmentBranchObservedLocally?: boolean;
  /** Internal stable presentation snapshot across plan revisions. */
  basicSkippedQuestionIds?: readonly string[];
  reviewedGroups?: readonly SetupQuestion['stateId'][];
  remoteTarget?: {
    owner: string;
    repository: string;
    token: string;
  };
  permissionIntent?: { draft: SetupConfiguration; answeredQuestionIds: readonly string[]; projectsWanted?: boolean };
  /** Internal same-run plan correction. No credential or approval is persisted here. */
  revision?: { group: SetupQuestion['stateId']; answeredQuestionIds: readonly string[] };
}

export type SetupWizardResult =
  | {
      status: 'completed';
      exitCode: 0;
      configuration: SetupConfiguration;
      plan: SetupPlan;
      remoteConfiguration?: SetupRemoteConfiguration;
      organizationImport?: SetupOrganizationImportResult;
    }
  | {
      status: 'cancelled';
      reason: 'questionnaire-cancelled' | 'confirmation-cancelled' | 'confirmation-declined';
      exitCode: 0 | 130;
      remoteConfiguration?: SetupRemoteConfiguration;
    }
  | {
      status: 'blocked';
      reason: 'remote-storage-unavailable';
      exitCode: 1;
      configuration: SetupConfiguration;
      errors: readonly string[];
      remoteConfiguration: SetupRemoteConfiguration;
    }
  | {
      status: 'blocked';
      reason: 'setup-permissions-unavailable';
      exitCode: 1;
      configuration: SetupConfiguration;
      errors: readonly string[];
      remoteConfiguration?: SetupRemoteConfiguration;
    };

export interface SetupWizardDependencies {
  runnerDiscovery?: import('../../ports/setup_runner_ports').SetupRunnerDiscoveryPort;
  installationReview?: import('../../ports/setup_runner_ports').SetupInstallationReviewPort;
  workflowPatConflict?: Pick<ResolveSetupWorkflowPatConflictUseCase, 'execute'>;
  collector?: SetupConfigurationCollectorPort;
  planPresenter: SetupPlanPresenterPort;
  confirmation: SetupPlanConfirmationPort;
  finalPermissionAudit: SetupFinalPermissionAuditPort;
  remoteConfiguration?: SetupRemoteConfigurationReadPort;
  mergeQueueReadiness?: SetupMergeQueueReadinessPort;
  approvalReadiness?: SetupApprovalReadinessPort;
  approvalCheckDiscovery?: SetupApprovalCheckDiscoveryPort;
  projectDiscovery?: SetupProjectDiscoveryPort;
  sessionLiveness?: () => 'active' | 'cancelled' | 'expired';
  onPermissionCleanupPending?: () => void;
}

export class SetupWizardUseCase {
  constructor(private readonly dependencies: SetupWizardDependencies) {}

  async execute(request: SetupWizardRequest): Promise<SetupWizardResult> {
    const defaults = buildInitialSetupConfiguration(request);
    const effectiveOverrides = request.overrides;
    let initial = request.permissionIntent ? cloneSetupConfiguration(request.permissionIntent.draft) : defaults;
    let organizationImport: SetupOrganizationImportResult | undefined;
    let remoteConfiguration: SetupRemoteConfiguration | undefined;
    if (request.remoteTarget) {
      try {
        remoteConfiguration = await this.dependencies.remoteConfiguration?.inspect(
          request.remoteTarget.owner,
          request.remoteTarget.repository,
          request.remoteTarget.token,
        ) ?? unavailableSetupRemoteConfiguration();
      } catch {
        remoteConfiguration = unavailableSetupRemoteConfiguration();
      }
    }
    const projectOwnerType = remoteConfiguration?.ownerType ?? 'Unknown';
    const explicitMainBranch = request.overrides?.repository?.mainBranch !== undefined;
    if (!explicitMainBranch && remoteConfiguration?.defaultBranch) {
      initial.repository.mainBranch = remoteConfiguration.defaultBranch;
    }
    if (request.configurationSource === 'organization') {
      if (request.deliveryMode !== 'pull-request' && remoteConfiguration && !hasCompleteSetupSecretRevisions(remoteConfiguration)) {
        return { status: 'blocked', reason: 'remote-storage-unavailable', exitCode: 1, configuration: initial,
          errors: ['Retained Secret revision metadata is incomplete. Restore metadata access and prepare a fresh plan before Apply.'], remoteConfiguration };
      }
      if (!request.revision) {
        for (const kind of ['variables', 'secrets'] as const) {
          if (!request.overrides?.storage?.[kind]?.defaultScope) initial.storage[kind].defaultScope = 'organization';
        }
      }
      organizationImport = request.revision && request.organizationImportSnapshot
        ? request.organizationImportSnapshot : importSetupOrganizationConfiguration({ configuration: initial,
        remote: remoteConfiguration ?? unavailableSetupRemoteConfiguration(),
        explicitQuestionIds: [...setupOrganizationExplicitQuestionIds(request.overrides),
          ...(request.permissionIntent?.answeredQuestionIds ?? [])],
        observedDevelopmentBranch: request.developmentBranchObservedLocally ? initial.repository.developmentBranch : undefined });
      if (organizationImport.inventory !== 'available') {
        return { status: 'blocked', reason: 'remote-storage-unavailable', exitCode: 1, configuration: initial,
          errors: [organizationImport.inventory === 'not-organization'
            ? 'Organization reuse requires an organization repository. Choose Customize for a personal repository.'
            : 'Organization and repository Variable inventory must be available before configuration can be reused.'],
          remoteConfiguration: remoteConfiguration ?? unavailableSetupRemoteConfiguration() };
      }
      if (!request.revision) initial = organizationImport.configuration;
    }
    const pendingImportedQuestions = organizationImport?.settings.filter(setting => setting.status === 'needs-review').map(setting => setting.questionId) ?? [];
    const basicSkippedQuestionIds = request.presentationMode === 'basic'
      ? (request.basicSkippedQuestionIds ?? setupBasicSkippedQuestionIds(initial)).filter(id =>
        !pendingImportedQuestions.some(path => id === path || id.startsWith(`${path}.`))) : [];
    const defaultValidationErrors = validateSetupConfiguration(initial, { allowIncompleteApproval: true });
    if (defaultValidationErrors.length > 0) {
      throw new ApplicationError(
        'configuration.invalid',
        `Invalid setup configuration:\n${defaultValidationErrors.map((error) => `- ${error}`).join('\n')}`,
      );
    }
    let approvalDiscovery = request.mode === 'interactive' && initial.pullRequestApproval.mode !== 'off'
      && request.remoteTarget && this.dependencies.approvalCheckDiscovery
      ? await this.dependencies.approvalCheckDiscovery.discover(
          request.remoteTarget.owner, request.remoteTarget.repository, request.remoteTarget.token, initial.repository.developmentBranch,
        ).catch(() => ({ status: 'unavailable' as const, candidates: [], truncated: false })) : undefined;
    let projectDiscovery = request.mode === 'interactive'
      && (request.permissionIntent?.projectsWanted !== false || request.revision?.group === 'projects')
      && request.remoteTarget && this.dependencies.projectDiscovery
      ? await this.dependencies.projectDiscovery.discover(
          request.remoteTarget.owner, projectOwnerType, request.remoteTarget.token,
        ).catch(() => ({ status: 'unavailable' as const, candidates: [] })) : undefined;
    let runnerInventory = initial.runners?.discover && request.remoteTarget && this.dependencies.runnerDiscovery
      ? await this.dependencies.runnerDiscovery.discover(request.remoteTarget.owner, request.remoteTarget.repository,
        request.remoteTarget.token, projectOwnerType).catch(() => ({ status: 'unavailable' as const, candidates: [], groups: [] })) : undefined;
    let context: SetupQuestionnaireContext = {
      ...(runnerInventory ? { runnerInventory } : {}),
      ...(remoteConfiguration ? { remote: remoteConfiguration } : {}),
      branchSources: { main: explicitMainBranch ? 'configuration' : remoteConfiguration?.defaultBranch ? 'github' : 'default',
        development: request.overrides?.repository?.developmentBranch !== undefined ? 'configuration'
          : request.developmentBranchObservedLocally ? 'local' : 'default' },
      variableNames: buildSetupRepositoryVariables(initial).map((variable) => variable.name),
      secretNames: buildSetupCredentialRequirements(initial).map((requirement) => requirement.name),
      ...(request.revision ? { skipQuestionIds: [...new Set([
        ...request.revision.answeredQuestionIds,
        ...basicSkippedQuestionIds,
      ])].filter(id => !setupQuestionIdsForGroup(request.revision!.group).includes(id)),
        projectsWanted: request.revision.group === 'projects' || Boolean(initial.projects.ids.trim()) } : {}),
      ...(!request.revision ? { skipQuestionIds: [...new Set([
        ...(request.permissionIntent?.answeredQuestionIds ?? []),
        ...(request.overrides?.runners?.discover !== undefined ? ['runners.discover'] : []),
        ...(organizationImport?.answeredQuestionIds ?? []),
        ...(request.permissionIntent?.projectsWanted === false ? ['projects.ids'] : []),
        ...basicSkippedQuestionIds,
      ])], ...(request.permissionIntent ? { projectsWanted: request.permissionIntent.projectsWanted } : {}) } : {}),
      ...(approvalDiscovery ? { approvalCheckCandidates: approvalDiscovery.candidates,
        approvalCheckDiscoveryStatus: approvalDiscovery.status,
        approvalCheckDiscoveryTruncated: approvalDiscovery.truncated } : {}),
      ...(projectDiscovery ? { projectDiscovery } : {}),
      ...(request.remoteTarget ? { projectOwner: request.remoteTarget.owner } : {}),
      discoveryRetryRemaining: { checks: approvalDiscovery ? 2 : 0,
        projects: projectDiscovery && projectDiscovery.status !== 'unsupported' ? 2 : 0 },
    };
    if (request.configurationSource === 'organization' || request.deliveryMode === 'pull-request') {
      // Both initial and revision context constructors always assign this collection.
      context = { ...context, skipQuestionIds: [...new Set([...context.skipQuestionIds!, ...setupQuestionIdsForGroup('storage')])] };
    }
    const discoveryRefresh = {
      refresh: async (kind: 'checks' | 'projects'): Promise<SetupQuestionnaireContext | undefined> => {
        const target = request.remoteTarget;
        // This context always owns both retry budgets; the selected adapter was present when its budget was issued.
        const remaining = context.discoveryRetryRemaining![kind];
        if (!target || remaining <= 0) return undefined;
        if (kind === 'checks') {
          approvalDiscovery = await this.dependencies.approvalCheckDiscovery!.discover(
            target.owner, target.repository, target.token, initial.repository.developmentBranch,
          ).catch(() => ({ status: 'unavailable' as const, candidates: [], truncated: false }));
          context = { ...context, approvalCheckCandidates: approvalDiscovery.candidates,
            approvalCheckDiscoveryStatus: approvalDiscovery.status,
            approvalCheckDiscoveryTruncated: approvalDiscovery.truncated,
            discoveryRetryRemaining: { ...context.discoveryRetryRemaining!, checks: remaining - 1 } };
        } else {
          projectDiscovery = await this.dependencies.projectDiscovery!.discover(
            target.owner, projectOwnerType, target.token,
          ).catch(() => ({ status: 'unavailable' as const, candidates: [] }));
          context = { ...context, projectDiscovery,
            discoveryRetryRemaining: { ...context.discoveryRetryRemaining!, projects: remaining - 1 } };
        }
        return context;
      },
    };
    const questionnaire = request.mode === 'interactive'
      ? await this.collectInteractive(initial, context, discoveryRefresh)
      : createSetupReviewState(initial);
    if (questionnaire.terminal === 'cancelled') {
      return {
        status: 'cancelled',
        reason: 'questionnaire-cancelled',
        exitCode: 130,
        ...(remoteConfiguration ? { remoteConfiguration } : {}),
      };
    }

    const collectedConfiguration = cloneSetupConfiguration(questionnaire.draft);
    if (request.deliveryMode === 'pull-request') collectedConfiguration.createInitialTag = false;
    if (collectedConfiguration.features.pullRequests === false
      && effectiveOverrides?.pullRequestApproval?.mode === undefined) {
      // The conditional approval questionnaire stage was skipped; its new-install
      // default must not outlive an explicit decision to disable PR automation.
      collectedConfiguration.pullRequestApproval = { ...collectedConfiguration.pullRequestApproval, mode: 'off' };
    }
    const validationErrors = [
      ...validateSetupConfiguration(collectedConfiguration, { allowIncompleteApproval: request.previewOnly === true }),
      ...validateDiscoveredProjectStatuses(collectedConfiguration, projectDiscovery),
    ];
    if (validationErrors.length > 0) {
      throw new ApplicationError(
        'configuration.invalid',
        `Invalid setup configuration:\n${validationErrors.map((error) => `- ${error}`).join('\n')}`,
      );
    }
    let configuration = normalizeSetupConfigurationLocales(collectedConfiguration);
    if (!configuration.runners?.discover) runnerInventory = undefined;
    else if (!initial.runners?.discover && request.remoteTarget && this.dependencies.runnerDiscovery) {
      runnerInventory = await this.dependencies.runnerDiscovery.discover(request.remoteTarget.owner, request.remoteTarget.repository,
        request.remoteTarget.token, projectOwnerType).catch(() => ({ status: 'unavailable' as const, candidates: [], groups: [] }));
    }
    if ((request.configurationSource === 'organization' || request.deliveryMode === 'pull-request') && remoteConfiguration) {
      configuration = configureSetupOrganizationReuseStorage(configuration, buildSetupOrganizationReuseVariables(configuration, remoteConfiguration), remoteConfiguration);
    }
    if (request.configurationSource !== 'organization' && request.deliveryMode !== 'pull-request' && request.mode === 'interactive' && request.remoteTarget && remoteConfiguration && this.dependencies.workflowPatConflict) {
      const resolved = await this.dependencies.workflowPatConflict.execute({ ...request.remoteTarget,
        configuration, remote: remoteConfiguration });
      configuration = resolved.configuration;
      remoteConfiguration = resolved.remote;
    }
    if (request.remoteTarget && remoteConfiguration) {
      let selectedWorkflowState: 'installed' | 'missing' | 'unavailable' = 'unavailable';
      try {
        selectedWorkflowState = await this.dependencies.remoteConfiguration?.inspectCredentialHealthWorkflow?.(
          request.remoteTarget.owner,
          request.remoteTarget.repository,
          request.remoteTarget.token,
          configuration.repository.mainBranch,
        ) ?? 'unavailable';
      } catch {
        // A failed selected-ref read cannot inherit the provisional default-branch state.
      }
      remoteConfiguration = { ...remoteConfiguration, credentialHealthWorkflow: selectedWorkflowState };
    }
    if (remoteConfiguration) {
      const remoteStorageErrors = [
        ...validateSetupStorageAgainstRemote(configuration, remoteConfiguration, { retainWorkflowPat: request.configurationSource === 'organization' || request.deliveryMode === 'pull-request' }),
        ...validateSetupManagedResourceInventory(configuration, remoteConfiguration, {
          secrets: buildSetupCredentialRequirements(configuration).map(requirement => requirement.name),
          variables: buildSetupRepositoryVariables(configuration).map(variable => variable.name),
        }),
      ];
      if (remoteStorageErrors.length > 0) {
        return {
          status: 'blocked',
          reason: 'remote-storage-unavailable',
          exitCode: 1,
          configuration: cloneSetupConfiguration(configuration),
          errors: remoteStorageErrors,
          remoteConfiguration,
        };
      }
    }

    const readiness = request.remoteTarget && this.dependencies.mergeQueueReadiness
      ? await this.dependencies.mergeQueueReadiness.inspect({
          owner: request.remoteTarget.owner,
          repository: request.remoteTarget.repository,
          token: request.remoteTarget.token,
          configuration,
          // Setup is the profile-creation surface, so its one artifact remains
          // authoritative English until the repository profile is installed.
          catalog: resolveStaticSetupDoctorCatalog(),
        })
      : [];
    const approvalReadiness: DoctorCheck[] = [];
    if (configuration.pullRequestApproval.mode !== 'off') {
      if (!request.remoteTarget || !this.dependencies.approvalReadiness) {
        approvalReadiness.push({
          id: 'approval.remote', status: 'skipped',
          summary: 'Branch rules and producer identities are unverified.',
          action: 'Run setup with a setup PAT before enabling native approval.', evidence: {}, blockedBy: [],
        });
        if (configuration.pullRequestApproval.mode === 'guarded' && !request.previewOnly) {
          throw new ApplicationError('configuration.invalid', 'Guarded approval requires remote branch-rule and producer inspection.');
        }
      } else {
        const facts = await this.dependencies.approvalReadiness.inspect(
          request.remoteTarget.owner, request.remoteTarget.repository, request.remoteTarget.token, configuration,
        );
        for (const rule of facts.rules) {
          const safe = rule.readable && rule.dismissesStaleReviews && !rule.approvalCheckCycle;
          approvalReadiness.push({
            id: `approval.rules.${rule.role}`, status: safe ? 'pass' : 'fail',
            summary: safe ? `${rule.branch}: stale approvals are dismissed.`
              : `${rule.branch}: stale-dismissal or approval-check safety is missing or unreadable.`,
            ...(safe ? {} : { action: 'Correct branch protection/rulesets or choose recommend/off.' }),
            evidence: { branch: rule.branch }, blockedBy: [],
          });
        }
        approvalReadiness.push({
          id: 'approval.producers', status: facts.missingWorkflowNames.length > 0 ? 'fail'
            : configuration.pullRequestApproval.producerAttested ? 'pass' : 'warn',
          summary: facts.missingWorkflowNames.length > 0 ? 'One or more selected producer workflows are absent or disabled.'
            : configuration.pullRequestApproval.producerAttested
              ? 'Selected producer workflows are active; exact check/App identity and coverage enforcement are operator-attested.'
              : 'Producer names are active, but exact check/App identity and coverage enforcement have not been attested.',
          ...(facts.missingWorkflowNames.length === 0 && configuration.pullRequestApproval.producerAttested
            ? {} : { action: 'Inspect exact CI checks, source App IDs, and coverage-enforcing steps; then attest or choose recommend/off.' }),
          evidence: { missingCount: facts.missingWorkflowNames.length }, blockedBy: [],
        });
        if (configuration.pullRequestApproval.mode === 'guarded' && approvalReadiness.some(check => check.status === 'fail') && !request.previewOnly) {
          throw new ApplicationError('configuration.invalid', 'Guarded approval is blocked: branch rules or exact CI producers are not ready. Choose recommend/off or correct them.');
        }
      }
    }
    const plan = buildSetupPlan(configuration, readiness, approvalReadiness);
    if (this.dependencies.installationReview && request.deliveryMode !== 'pull-request') {
      const review = await this.dependencies.installationReview.inspect(configuration);
      plan.installationReview = { ...review, jobs: review.jobs.map(job => ({ ...job,
        status: setupRunnerReadiness(job.runsOn, runnerInventory) })) };
    }
    plan.deliveryMode = request.deliveryMode ?? 'local';
    if ((request.configurationSource === 'organization' || request.deliveryMode === 'pull-request') && remoteConfiguration) {
      plan.variables = buildSetupOrganizationReuseVariables(configuration, remoteConfiguration);
      const reuse = planSetupOrganizationVariableReuse(plan.variables, remoteConfiguration);
      plan.organizationReuse = {
        imported: organizationImport?.settings.filter(setting => setting.status === 'imported').length ?? 0,
        needsReview: organizationImport?.settings.filter(setting => setting.status === 'needs-review').length ?? 0,
        organizationVariables: [...new Set(reuse.retained.filter(binding => binding.scope === 'organization').map(binding => binding.sourceName ?? binding.name))],
        repositoryVariables: [...new Set(reuse.retained.filter(binding => binding.scope === 'repository').map(binding => binding.sourceName ?? binding.name))],
        repositoryWrites: reuse.repositoryWrites.map(variable => variable.name),
      };
    }
    if (request.remoteTarget && remoteConfiguration && configuration.manageRepositorySecrets) {
      plan.workflowPatStorage = setupWorkflowPatStorageNotice(request.remoteTarget.owner, request.remoteTarget.repository,
        configuration.storage.secrets, remoteConfiguration.repositorySecrets, remoteConfiguration.organizationSecrets,
        remoteConfiguration.organizationWorkflowPat);
      if (request.configurationSource === 'organization' || request.deliveryMode === 'pull-request') plan.workflowPatStorage = { ...plan.workflowPatStorage, operation: 'retain' };
    }
    plan.permissionProbes = (request.deliveryMode === 'pull-request'
      ? buildSetupBatchPatPermissionRequirements(configuration, remoteConfiguration, request.installationGrants)
      : request.configurationSource === 'organization'
      ? buildSetupOrganizationReusePermissionRequirements(configuration, remoteConfiguration)
      : buildConfiguredSetupPatPermissionRequirements(configuration, remoteConfiguration))
      .filter(item => item.applicability === 'required' && item.level === 'write')
      .map(item => ({ scope: item.scope, permission: item.permission }));
    if (basicSkippedQuestionIds.length) {
      const byGroup = new Map<string, number>();
      for (const item of setupQuestionContentInventory()) {
        if (basicSkippedQuestionIds.includes(item.id) && !request.reviewedGroups?.includes(item.stateId)
          && request.revision?.group !== item.stateId) byGroup.set(item.stateId, (byGroup.get(item.stateId) ?? 0) + 1);
      }
      plan.presentationDefaults = [...byGroup].map(([group, count]) => ({ group, count }));
    }
    this.dependencies.planPresenter.present(plan);
    const confirmation = enterSetupConfirmation(questionnaire);
    const decision = await this.dependencies.confirmation.confirm(plan);
    if (decision.kind === 'revise') {
      if (request.mode !== 'interactive') throw new ApplicationError('configuration.invalid', 'Plan editing requires interactive setup.');
      const answeredQuestionIds = [...new Set([
        ...(request.revision?.answeredQuestionIds ?? []),
        ...(request.permissionIntent?.answeredQuestionIds ?? []),
        ...(request.overrides?.runners?.discover !== undefined ? ['runners.discover'] : []),
        ...(organizationImport?.answeredQuestionIds ?? []),
        ...(questionnaire.answeredQuestionIds ?? []),
      ])];
      return this.execute({ ...request, overrides: cloneSetupConfiguration(configuration), permissionIntent: undefined,
        ...(organizationImport ? { organizationImportSnapshot: organizationImport } : {}),
        basicSkippedQuestionIds, reviewedGroups: [...new Set([...(request.reviewedGroups ?? []), decision.group])],
        revision: { group: decision.group, answeredQuestionIds } });
    }
    const completed = finishSetupQuestionnaire(confirmation, decision.kind === 'approved');
    if (completed.terminal === 'cancelled') {
      return {
        status: 'cancelled',
        reason: decision.kind === 'cancelled' ? 'confirmation-cancelled' : 'confirmation-declined',
        exitCode: decision.kind === 'cancelled' ? 130 : 0,
        ...(remoteConfiguration ? { remoteConfiguration } : {}),
      };
    }
    if (this.dependencies.sessionLiveness?.() === 'cancelled') {
      return { status: 'cancelled', reason: 'confirmation-cancelled', exitCode: 130,
        ...(remoteConfiguration ? { remoteConfiguration } : {}) };
    }
    if (this.dependencies.sessionLiveness?.() === 'expired') {
      return { status: 'blocked', reason: 'setup-permissions-unavailable', exitCode: 1,
        configuration: cloneSetupConfiguration(configuration), errors: ['The local setup session expired before permission checks began.'],
        ...(remoteConfiguration ? { remoteConfiguration } : {}) };
    }
    if (plan.installationReview?.blockers.length) throw new ApplicationError('configuration.invalid', plan.installationReview.blockers.join(' '));
    if (request.previewOnly) {
      return { status: 'completed', exitCode: 0, configuration: cloneSetupConfiguration(configuration), plan,
        ...(organizationImport ? { organizationImport } : {}),
        ...(remoteConfiguration ? { remoteConfiguration } : {}) };
    }
    if (configuration.runners?.mode === 'organization-profile') {
      const target = request.remoteTarget;
      let fresh: SetupRemoteConfiguration | undefined;
      try { fresh = target && await this.dependencies.remoteConfiguration?.inspect(target.owner, target.repository, target.token); }
      catch { /* A failed read cannot establish profile freshness. */ }
      if (!fresh || !setupRunnerProfileIsFresh(configuration.runners, fresh)) {
        throw new ApplicationError('configuration.invalid', 'The runner registry changed or is unavailable. No permission probes or installation writes started; review a fresh profile snapshot.');
      }
    }
    const audit = this.dependencies.onPermissionCleanupPending
      ? await this.dependencies.finalPermissionAudit.audit(
        configuration, remoteConfiguration, this.dependencies.onPermissionCleanupPending)
      : await this.dependencies.finalPermissionAudit.audit(configuration, remoteConfiguration);
    if (audit.status === 'blocked' && audit.cleanupPending) {
      return { status: 'blocked', reason: 'setup-permissions-unavailable', exitCode: 1,
        configuration: cloneSetupConfiguration(configuration), errors: audit.errors,
        ...(remoteConfiguration ? { remoteConfiguration } : {}) };
    }
    if (this.dependencies.sessionLiveness?.() === 'cancelled') {
      return { status: 'cancelled', reason: 'confirmation-cancelled', exitCode: 130,
        ...(remoteConfiguration ? { remoteConfiguration } : {}) };
    }
    if (this.dependencies.sessionLiveness?.() === 'expired') {
      return { status: 'blocked', reason: 'setup-permissions-unavailable', exitCode: 1,
        configuration: cloneSetupConfiguration(configuration), errors: ['The local setup session expired during permission checks.'],
        ...(remoteConfiguration ? { remoteConfiguration } : {}) };
    }
    if (audit.status === 'blocked') {
      return {
        status: 'blocked',
        reason: 'setup-permissions-unavailable',
        exitCode: 1,
        configuration: cloneSetupConfiguration(configuration),
        errors: audit.errors,
        ...(remoteConfiguration ? { remoteConfiguration } : {}),
      };
    }
    return {
      status: 'completed',
      exitCode: 0,
      configuration: cloneSetupConfiguration(configuration),
      plan,
      ...(organizationImport ? { organizationImport } : {}),
      ...(remoteConfiguration ? { remoteConfiguration } : {}),
    };
  }

  private collectInteractive(
    defaults: SetupConfiguration,
    context: Parameters<NonNullable<SetupWizardDependencies['collector']>['collect']>[1],
    discoveryRefresh?: Parameters<NonNullable<SetupWizardDependencies['collector']>['collect']>[2],
  ) {
    if (!this.dependencies.collector) {
      throw new ApplicationError('configuration.invalid', 'Interactive setup requires a questionnaire collector.');
    }
    return this.dependencies.collector.collect(createSetupQuestionnaire(defaults, context), context, discoveryRefresh);
  }
}

export function buildInitialSetupConfiguration(request: Pick<SetupWizardRequest,
  'mode' | 'overrides' | 'skipRepositoryVariables' | 'skipRepositorySecrets'>): SetupConfiguration {
    const effectiveOverrides = request.mode === 'non-interactive'
      && request.overrides?.repositoryAgentGuidance?.agentsPointer === undefined
      ? {
          ...request.overrides,
          repositoryAgentGuidance: {
            ...request.overrides?.repositoryAgentGuidance,
            agentsPointer: 'create-if-missing' as const,
          },
        }
      : request.overrides;
    const defaults = mergeSetupConfiguration(
      mergeSetupConfiguration(createDefaultSetupConfiguration(), { pullRequestApproval: DEFAULT_PULL_REQUEST_APPROVAL_POLICY }),
      {
        ...effectiveOverrides,
        ...(request.skipRepositoryVariables ? { manageRepositoryVariables: false } : {}),
        ...(request.skipRepositorySecrets ? { manageRepositorySecrets: false } : {}),
      },
    );
    if (defaults.features.pullRequests === false && effectiveOverrides?.pullRequestApproval?.mode === undefined) {
      defaults.pullRequestApproval = { ...defaults.pullRequestApproval, mode: 'off' };
    }
    return defaults;
}
