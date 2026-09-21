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
} from '../../policies/setup_questionnaire_policy';
import { cloneSetupConfiguration } from '../../policies/setup_configuration_clone_policy';
import { resolveStaticSetupDoctorCatalog } from '../../policies/setup_doctor_message_catalog';
import { DEFAULT_PULL_REQUEST_APPROVAL_POLICY } from '../../../domain/pull_request_approval_policy';
import type { SetupApprovalReadinessPort } from '../../ports/setup_approval_readiness_port';
import type { DoctorCheck } from '../../../domain/setup';

export interface SetupWizardRequest {
  mode: 'interactive' | 'non-interactive';
  overrides?: SetupConfigurationOverrides;
  skipRepositoryVariables?: boolean;
  skipRepositorySecrets?: boolean;
  previewOnly?: boolean;
  remoteTarget?: {
    owner: string;
    repository: string;
    token: string;
  };
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
    };

export interface SetupWizardDependencies {
  collector?: SetupConfigurationCollectorPort;
  planPresenter: SetupPlanPresenterPort;
  confirmation: SetupPlanConfirmationPort;
  finalPermissionAudit: SetupFinalPermissionAuditPort;
  remoteConfiguration?: SetupRemoteConfigurationReadPort;
  mergeQueueReadiness?: SetupMergeQueueReadinessPort;
  approvalReadiness?: SetupApprovalReadinessPort;
}

export class SetupWizardUseCase {
  constructor(private readonly dependencies: SetupWizardDependencies) {}

  async execute(request: SetupWizardRequest): Promise<SetupWizardResult> {
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
    const defaultValidationErrors = validateSetupConfiguration(defaults, { allowIncompleteApproval: true });
    if (defaultValidationErrors.length > 0) {
      throw new ApplicationError(
        'configuration.invalid',
        `Invalid setup configuration:\n${defaultValidationErrors.map((error) => `- ${error}`).join('\n')}`,
      );
    }
    const context = {
      ...(remoteConfiguration ? { remote: remoteConfiguration } : {}),
      variableNames: buildSetupRepositoryVariables(defaults).map((variable) => variable.name),
      secretNames: buildSetupCredentialRequirements(defaults).map((requirement) => requirement.name),
    };
    const questionnaire = request.mode === 'interactive'
      ? await this.collectInteractive(defaults, context)
      : createSetupReviewState(defaults);
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
    const validationErrors = validateSetupConfiguration(collectedConfiguration, { allowIncompleteApproval: request.previewOnly === true });
    if (validationErrors.length > 0) {
      throw new ApplicationError(
        'configuration.invalid',
        `Invalid setup configuration:\n${validationErrors.map((error) => `- ${error}`).join('\n')}`,
      );
    }
    const configuration = normalizeSetupConfigurationLocales(collectedConfiguration);
    await this.dependencies.finalPermissionAudit.audit(configuration, remoteConfiguration);
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
    this.dependencies.planPresenter.present(plan);
    const confirmation = enterSetupConfirmation(questionnaire);
    const decision = await this.dependencies.confirmation.confirm(plan);
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
  ) {
    if (!this.dependencies.collector) {
      throw new ApplicationError('configuration.invalid', 'Interactive setup requires a questionnaire collector.');
    }
    return this.dependencies.collector.collect(createSetupQuestionnaire(defaults, context), context);
  }
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
