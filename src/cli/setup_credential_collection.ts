import type { SetupConfiguration, SetupCredentialCollection, SetupRemoteConfiguration } from '../domain/setup';
import { buildSetupCredentialRequirements } from '../application/policies/setup_configuration_policy';
import { buildWorkflowPatPermissionRequirements } from '../application/policies/setup_token_permission_policy';
import { buildSetupPatCreationUrl, UnsupportedSetupPatLinkError } from '../application/policies/setup_pat_creation_url_policy';
import { VerifyGuidedWorkflowPatIdentityUseCase } from '../application/usecases/setup/verify_guided_workflow_pat_identity_use_case';
import { createSetupCredentialsUseCase } from '../infrastructure/composition/setup_credentials_composition_root';
import { SetupGithubIdentityQueryAdapter } from '../infrastructure/setup_github_identity_query_adapter';
import { logInfo } from '../utils/logger';
import { SetupCredentialPromptAdapter } from './setup_credential_prompt_adapter';
import { ConsoleSetupTokenPermissionPresenter } from './setup_token_permission_presenter';
import { WebSetupCredentialPrompt, WebSetupPermissionPresenter } from './web_setup_adapters';
import type { WebSetupBridge } from './web_setup_bridge';

interface CredentialInput {
  readonly owner: string;
  readonly repository: string;
  readonly setupToken: string;
  readonly setupPatAccount?: string;
  readonly configuration: SetupConfiguration;
  readonly remoteConfiguration?: SetupRemoteConfiguration;
  readonly skipSecrets: boolean;
  readonly nonInteractive: boolean;
  readonly workflowPat?: string;
  readonly secret?: Readonly<Record<string, string>>;
  readonly bridge?: WebSetupBridge;
  readonly prompt: SetupCredentialPromptAdapter | WebSetupCredentialPrompt;
  readonly permissionPresenter: ConsoleSetupTokenPermissionPresenter | WebSetupPermissionPresenter;
  readonly possibleMutation: () => void;
}

/** Wires bot-PAT guidance and credential ports for both setup presentations. */
export async function collectSetupCredentials(input: CredentialInput): Promise<SetupCredentialCollection> {
  const requirements = buildSetupCredentialRequirements(input.configuration);
  const workflowTokenPermissions = buildWorkflowPatPermissionRequirements(input.configuration, input.remoteConfiguration);
  const githubIdentities = new SetupGithubIdentityQueryAdapter();
  if (!input.nonInteractive && !input.workflowPat && !input.secret?.PAT) {
    try {
      const guide = buildSetupPatCreationUrl({
        role: 'workflow', owner: input.owner, repository: input.repository, expiresIn: 90,
        requirements: workflowTokenPermissions,
      });
      input.prompt.configureWorkflowPatGuide(guide, login => githubIdentities.resolve(login, input.setupToken), workflowTokenPermissions);
    } catch (error) {
      if (!(error instanceof UnsupportedSetupPatLinkError)) throw error;
      logInfo('A guided fine-grained bot PAT link is unavailable for one or more required permissions. Use the permission table and manual path; review whether a classic PAT is required for this plan.');
      input.permissionPresenter.showDetailedRequirements('workflow', workflowTokenPermissions);
    }
  }
  const credentials = await createSetupCredentialsUseCase(input.prompt, input.permissionPresenter,
    input.bridge ? { allowPreApplyHealthWorkflow: false } : {
      onTemporaryWorkflowMutationAttempt: input.possibleMutation,
    }).collect({
    owner: input.owner, repository: input.repository, setupToken: input.setupToken,
    requirements, manageSecrets: !input.skipSecrets && input.configuration.manageRepositorySecrets,
    secretStoragePolicy: input.configuration.storage.secrets,
    ref: input.configuration.repository.mainBranch, remoteConfiguration: input.remoteConfiguration,
    workflowTokenPermissions,
    ...(input.configuration.projects.ids ? { selectedProjectNumbers: input.configuration.projects.ids } : {}),
  });
  const guidedBotIdentity = input.prompt.guidedWorkflowBotIdentity;
  if (guidedBotIdentity && credentials.collection.workflowPat) {
    // Revalidate at the installation boundary after potentially long capability checks.
    const verifiedBot = await new VerifyGuidedWorkflowPatIdentityUseCase(githubIdentities)
      .execute(guidedBotIdentity, credentials.collection.workflowPat.value);
    logInfo(`✅ Workflow PAT owner verified as @${verifiedBot.login} (GitHub account ID ${verifiedBot.id}).`);
    if (input.setupPatAccount?.toLowerCase() === verifiedBot.login.toLowerCase()) {
      logInfo('The workflow PAT and setup PAT use the same GitHub account. If this account authors PRs, bot-generated events and guarded self-approval may not behave as intended; use a dedicated bot account where required.');
    }
  }
  return credentials.collection;
}
