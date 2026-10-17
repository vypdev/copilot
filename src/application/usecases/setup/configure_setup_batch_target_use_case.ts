import type { SetupConfiguration, SetupRemoteConfiguration } from '../../../domain/setup';
import type { SetupBatchSharedResource, SetupBatchTarget } from '../../../domain/setup_batch';
import type { SetupWizardUseCase } from './setup_wizard_use_case';
import type { SetupCredentialsUseCase } from './setup_credentials_use_case';
import type { SetupConfigurationOverrides } from '../../policies/setup_configuration_policy';
import { planSetupBatchSharedAccess } from '../../policies/setup_batch_access_policy';
import { buildSetupCredentialRequirements } from '../../policies/setup_credential_requirement_policy';
import { buildWorkflowPatPermissionRequirements } from '../../policies/setup_token_permission_policy';
import { validateSetupConfiguration } from '../../policies/setup_configuration_validation';
import { SetupInteractionCancelledError } from '../../errors/setup_interaction_cancelled_error';

/** Questionnaire and metadata verification are shared application work, independent of either UI. */
export class ConfigureSetupBatchTargetUseCase {
  constructor(private readonly ports: { readonly wizard: Pick<SetupWizardUseCase, 'execute'>;
    readonly credentials: Pick<SetupCredentialsUseCase, 'collect'> }) {}
  async execute(request: { readonly target: SetupBatchTarget; readonly remote: SetupRemoteConfiguration;
    readonly actualRemote: SetupRemoteConfiguration; readonly shared: readonly SetupBatchSharedResource[];
    readonly token: string; readonly configurationSource: 'organization' | 'customize';
    readonly overrides?: SetupConfigurationOverrides; readonly presentationMode: 'basic' | 'custom';
    readonly skipVariables?: boolean; readonly skipSecrets?: boolean }): Promise<{
      readonly configuration: SetupConfiguration; readonly blocked?: readonly string[];
    } | undefined> {
    const result = await this.ports.wizard.execute({ mode: 'interactive', overrides: request.overrides,
      configurationSource: request.configurationSource, presentationMode: request.presentationMode,
      deliveryMode: 'pull-request', previewOnly: true,
      skipRepositoryVariables: request.skipVariables, skipRepositorySecrets: request.skipSecrets,
      remoteTarget: { owner: request.target.owner, repository: request.target.name, token: request.token } });
    if (result.status === 'cancelled') throw new SetupInteractionCancelledError();
    if (result.status === 'blocked') return { configuration: result.configuration,
      blocked: ['Configuration or remote storage requires attention before this target can be applied.'] };
    const configuration = result.configuration;
    const validation = validateSetupConfiguration(configuration);
    if (validation.length || configuration.pullRequestApproval.mode === 'guarded'
      && result.plan.approvalReadiness.some(check => check.status === 'fail')) return { configuration,
      blocked: ['Target-specific configuration and guarded approval checks must be resolved before Apply.'] };
    const access = planSetupBatchSharedAccess(configuration, request.target, request.actualRemote, request.shared);
    const requirements = buildSetupCredentialRequirements(configuration);
    if (access.missing.length) return { configuration, blocked: access.missing.map(binding => {
      const options = requirements.filter(requirement => requirement.name === binding || requirement.alternativeGroups?.includes(binding));
      return `A required existing credential binding is unavailable: ${options.map(requirement => requirement.name).join(' or ')}. Provision or authorize a supported binding for this target in GitHub, or run single-repository Customize from that repository; then inspect this batch again.`;
    }) };
    const pending = access.grants.filter(grant => grant.kind === 'secret').map(grant => grant.name);
    try {
      // Both batch sources keep Secret bindings. Customize changes settings only;
      // collecting new credential values belongs to current-repository setup.
      const credentials = await this.ports.credentials.collect({ owner: request.target.owner, repository: request.target.name,
        setupToken: request.token, requirements,
        manageSecrets: configuration.manageRepositorySecrets, secretStoragePolicy: configuration.storage.secrets,
        remoteConfiguration: access.projected, configurationSource: 'organization', pendingOrganizationSecretNames: pending,
        workflowTokenPermissions: buildWorkflowPatPermissionRequirements(configuration, access.projected) });
      if (credentials.collection.workflowPat || credentials.collection.apiKeys.length) throw new Error('A batch reuse result cannot contain Secret values.');
    } catch (error) {
      if (error instanceof SetupInteractionCancelledError) throw error;
      return { configuration, blocked: ['An existing credential did not pass its available trusted check. Inspect its access or verification before retrying.'] };
    }
    return { configuration };
  }
}
