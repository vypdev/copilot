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
import type { DoctorCheck } from '../../../domain/setup';

export interface SetupWizardRequest {
  mode: 'interactive' | 'non-interactive';
  overrides?: SetupConfigurationOverrides;
  skipRepositoryVariables?: boolean;
  skipRepositorySecrets?: boolean;
  previewOnly?: boolean;
  presentationMode?: 'basic' | 'custom';
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
  collector?: SetupConfigurationCollectorPort;
  planPresenter: SetupPlanPresenterPort;
  confirmation: SetupPlanConfirmationPort;
  finalPermissionAudit: SetupFinalPermissionAuditPort;
  remoteConfiguration?: SetupRemoteConfigurationReadPort;
  mergeQueueReadiness?: SetupMergeQueueReadinessPort;
  approvalReadiness?: SetupApprovalReadinessPort;
  approvalCheckDiscovery?: SetupApprovalCheckDiscoveryPort;
  projectDiscovery?: SetupProjectDiscoveryPort;
}

export class SetupWizardUseCase {
  constructor(private readonly dependencies: SetupWizardDependencies) {}

  async execute(request: SetupWizardRequest): Promise<SetupWizardResult> {
    const defaults = buildInitialSetupConfiguration(request);
    const effectiveOverrides = request.overrides;
    const initial = request.permissionIntent ? cloneSetupConfiguration(request.permissionIntent.draft) : defaults;
    const basicSkippedQuestionIds = request.presentationMode === 'basic'
      ? request.basicSkippedQuestionIds ?? setupBasicSkippedQuestionIds(initial) : [];
    let remoteConfiguration: SetupRemoteConfiguration | undefined;
    if (request.remoteTarget) {
      try {
        remoteConfiguration = await this.dependencies.remoteConfiguration?.inspect(
          request.remoteTarget.owner,
          request.remoteTarget.repository,
          request.remoteTarget.token,
        ) ?? unavailableRemoteConfiguration();
      } catch {
        remoteConfiguration = unavailableRemoteConfiguration();
      }
    }
    const explicitMainBranch = request.overrides?.repository?.mainBranch !== undefined;
    if (!explicitMainBranch && remoteConfiguration?.defaultBranch) {
      initial.repository.mainBranch = remoteConfiguration.defaultBranch;
    }
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
          request.remoteTarget.owner, remoteConfiguration?.ownerType ?? 'Unknown', request.remoteTarget.token,
        ).catch(() => ({ status: 'unavailable' as const, candidates: [] })) : undefined;
    let context: SetupQuestionnaireContext = {
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
    const discoveryRefresh = {
      refresh: async (kind: 'checks' | 'projects'): Promise<SetupQuestionnaireContext | undefined> => {
        const target = request.remoteTarget;
        const remaining = context.discoveryRetryRemaining?.[kind] ?? 0;
        if (!target || remaining <= 0) return undefined;
        if (kind === 'checks') {
          if (!this.dependencies.approvalCheckDiscovery) return undefined;
          approvalDiscovery = await this.dependencies.approvalCheckDiscovery.discover(
            target.owner, target.repository, target.token, initial.repository.developmentBranch,
          ).catch(() => ({ status: 'unavailable' as const, candidates: [], truncated: false }));
          context = { ...context, approvalCheckCandidates: approvalDiscovery.candidates,
            approvalCheckDiscoveryStatus: approvalDiscovery.status,
            approvalCheckDiscoveryTruncated: approvalDiscovery.truncated,
            discoveryRetryRemaining: { ...context.discoveryRetryRemaining!, checks: remaining - 1 } };
        } else {
          if (!this.dependencies.projectDiscovery) return undefined;
          projectDiscovery = await this.dependencies.projectDiscovery.discover(
            target.owner, remoteConfiguration?.ownerType ?? 'Unknown', target.token,
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
    const configuration = normalizeSetupConfigurationLocales(collectedConfiguration);
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
    const audit = await this.dependencies.finalPermissionAudit.audit(configuration, remoteConfiguration);
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
    if (remoteConfiguration) {
      const remoteStorageErrors = [
        ...validateSetupStorageAgainstRemote(configuration, remoteConfiguration),
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
        ...(questionnaire.answeredQuestionIds ?? []),
      ])];
      return this.execute({ ...request, overrides: cloneSetupConfiguration(configuration), permissionIntent: undefined,
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
    return {
      status: 'completed',
      exitCode: 0,
      configuration: cloneSetupConfiguration(configuration),
      plan,
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

/** An unavailable read is explicit, never an authoritative empty inventory. */
function unavailableRemoteConfiguration(): SetupRemoteConfiguration {
  return {
    ownerType: 'Unknown', repositoryVisibility: 'unknown',
    repositorySecrets: [], repositorySecretsAccess: 'unavailable',
    organizationSecrets: [], organizationSecretsAccess: 'unavailable',
    repositoryVariables: [], repositoryVariablesAccess: 'unavailable',
    organizationVariables: [], organizationVariablesAccess: 'unavailable',
    organizationAccess: 'unavailable', credentialHealthWorkflow: 'unavailable',
  };
}
