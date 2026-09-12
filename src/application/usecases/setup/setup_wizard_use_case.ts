import type {
  SetupConfigurationCollectorPort,
  SetupPlanConfirmationPort,
  SetupPlanPresenterPort,
} from '../../ports/setup_terminal_ports';
import type {
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

export interface SetupWizardRequest {
  mode: 'interactive' | 'non-interactive';
  overrides?: SetupConfigurationOverrides;
  skipRepositoryVariables?: boolean;
  skipRepositorySecrets?: boolean;
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
    };

export interface SetupWizardDependencies {
  collector?: SetupConfigurationCollectorPort;
  planPresenter: SetupPlanPresenterPort;
  confirmation: SetupPlanConfirmationPort;
  remoteConfiguration?: SetupRemoteConfigurationReadPort;
  mergeQueueReadiness?: SetupMergeQueueReadinessPort;
}

export class SetupWizardUseCase {
  constructor(private readonly dependencies: SetupWizardDependencies) {}

  async execute(request: SetupWizardRequest): Promise<SetupWizardResult> {
    const defaults = mergeSetupConfiguration(
      createDefaultSetupConfiguration(),
      {
        ...request.overrides,
        ...(request.skipRepositoryVariables ? { manageRepositoryVariables: false } : {}),
        ...(request.skipRepositorySecrets ? { manageRepositorySecrets: false } : {}),
      },
    );
    const remoteConfiguration = request.remoteTarget && this.dependencies.remoteConfiguration
      ? await this.dependencies.remoteConfiguration.inspect(
          request.remoteTarget.owner,
          request.remoteTarget.repository,
          request.remoteTarget.token,
        )
      : undefined;
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

    const configuration = cloneSetupConfiguration(questionnaire.draft);
    const validationErrors = validateSetupConfiguration(configuration);
    if (remoteConfiguration) {
      validationErrors.push(...validateSetupStorageAgainstRemote(configuration, remoteConfiguration));
    }
    if (validationErrors.length > 0) {
      throw new ApplicationError(
        'configuration.invalid',
        `Invalid setup configuration:\n${validationErrors.map((error) => `- ${error}`).join('\n')}`,
      );
    }

    const readiness = request.remoteTarget && this.dependencies.mergeQueueReadiness
      ? await this.dependencies.mergeQueueReadiness.inspect({
          owner: request.remoteTarget.owner,
          repository: request.remoteTarget.repository,
          token: request.remoteTarget.token,
          configuration,
        })
      : [];
    const plan = buildSetupPlan(configuration, readiness);
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
      configuration: cloneSetupConfiguration(completed.draft),
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
