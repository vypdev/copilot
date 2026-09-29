import { PrepareSetupPatIntentUseCase } from '../application/usecases/setup/prepare_setup_pat_intent_use_case';
import type { SetupConfigurationOverrides } from '../application/policies/setup_configuration_policy';
import { SetupQuestionnaireController } from '../application/usecases/setup/setup_questionnaire_controller';
import type { SetupJourneyUseCase } from '../application/usecases/setup/setup_journey_use_case';
import type { SetupTokenPermissionRequirement } from '../domain/setup_token_permissions';
import type { SetupConfiguration } from '../domain/setup';
import { logInfo } from '../utils/logger';
import type { createInteractiveTerminalDriver } from './setup_terminal_driver';
import { ConsoleSetupQuestionRenderer } from './setup_question_renderer';
import { SetupCredentialPromptAdapter } from './setup_credential_prompt_adapter';
import { ConsoleSetupTokenPermissionPresenter } from './setup_token_permission_presenter';
import { WebSetupQuestionnaireCollector, WebSetupCredentialPrompt, WebSetupPermissionPresenter } from './web_setup_adapters';
import type { WebSetupBridge } from './web_setup_bridge';

interface SetupPatIntentInput {
  readonly owner: string;
  readonly repository: string;
  readonly overrides: SetupConfigurationOverrides;
  readonly skipRepositoryVariables: boolean;
  readonly skipRepositorySecrets: boolean;
  readonly terminal?: ReturnType<typeof createInteractiveTerminalDriver>;
  readonly bridge?: WebSetupBridge;
  readonly journey?: SetupJourneyUseCase;
  readonly credentialPrompt: SetupCredentialPromptAdapter | WebSetupCredentialPrompt;
  readonly permissionPresenter: ConsoleSetupTokenPermissionPresenter | WebSetupPermissionPresenter;
  readonly initialRequirements: readonly SetupTokenPermissionRequirement[];
}

export interface SetupPatIntentResult {
  readonly requirements: readonly SetupTokenPermissionRequirement[];
  readonly assertedOwnerKind?: 'Organization' | 'User';
  readonly permissionIntent?: { draft: SetupConfiguration; answeredQuestionIds: readonly string[]; projectsWanted: boolean };
}

/** Presentation wiring for the shared application permission-intent decision. */
export async function collectSetupPatIntent(input: SetupPatIntentInput): Promise<SetupPatIntentResult> {
  const { bridge, credentialPrompt, permissionPresenter } = input;
  if (await credentialPrompt.chooseSetupPatMethod() !== 'guided') {
    permissionPresenter.showDetailedRequirements('setup', input.initialRequirements);
    return { requirements: input.initialRequirements };
  }
  const prepared = await new PrepareSetupPatIntentUseCase({
    collect: (initial, context, pass) => (bridge
      ? new WebSetupQuestionnaireCollector(bridge, pass)
      : new SetupQuestionnaireController(input.terminal!, new ConsoleSetupQuestionRenderer('permission-intent', pass)))
      .collect(initial, context),
    chooseOwnerKind: () => credentialPrompt.chooseSetupOwnerKind(),
    review: () => credentialPrompt.reviewSetupPatIntent(),
    showPreview: ({ draft, requirements, uncertain, ownerConflict, errors, pass, projectsWanted }) => {
      if (ownerConflict) logInfo('This plan selects organization storage or Projects, but the owner was declared a personal account. Revise the choices or use the manual PAT path.');
      if (errors.length) logInfo(`The selected local configuration needs correction before a guided link can be generated:\n${errors.map(item => `  - ${item}`).join('\n')}`);
      if (pass > 1) logInfo('Choice review complete. Returning to setup PAT permission review.');
      logInfo('Permission intent:');
      logInfo(`  Initial tag: ${draft.createInitialTag ? 'yes' : 'no'}; issue workflows: ${draft.features.issues ? draft.issueWorkflows.enabled.join(', ') || 'none' : 'disabled'}; PR approval: ${draft.pullRequestApproval.mode}`);
      logInfo(`  Secrets: ${draft.manageRepositorySecrets ? draft.storage.secrets.defaultScope : 'off'}; Variables: ${draft.manageRepositoryVariables ? draft.storage.variables.defaultScope : 'off'}; Projects: ${projectsWanted ? 'yes (choose exact Projects after PAT)' : 'none'}`);
      bridge?.message(`Permission preview: issue workflows ${draft.features.issues ? draft.issueWorkflows.enabled.join(', ') || 'none' : 'disabled'}; PR approval ${draft.pullRequestApproval.mode}; Secrets ${draft.manageRepositorySecrets ? draft.storage.secrets.defaultScope : 'off'}; Variables ${draft.manageRepositoryVariables ? draft.storage.variables.defaultScope : 'off'}; Projects ${projectsWanted ? 'yes (choose after PAT)' : 'none'}.`, 'info', undefined, 'permission.preview', {
        issues: draft.features.issues ? draft.issueWorkflows.enabled.join('|') || 'none' : 'disabled',
        approval: draft.pullRequestApproval.mode,
        secrets: draft.manageRepositorySecrets ? draft.storage.secrets.defaultScope : 'off',
        variables: draft.manageRepositoryVariables ? draft.storage.variables.defaultScope : 'off',
        projects: projectsWanted ? 'yes' : 'none',
      });
      permissionPresenter.showRequirements('setup', requirements);
      if (uncertain.length) logInfo(`May need after GitHub inspection:\n${uncertain.map(item => `  - ${item}`).join('\n')}`);
    },
    showDetails: requirements => permissionPresenter.showDetailedRequirements('setup', requirements),
    onManual: reason => {
      if (reason === 'owner-unknown') logInfo('Owner type was not confirmed. Use the manual PAT table, or check whether the GitHub owner is an organization before retrying guided setup.');
      if (reason === 'unsupported') logInfo('A guided setup PAT link is unavailable for this owner or permission set. Enter a manually created PAT using the table above.');
      credentialPrompt.useManualSetupPat();
      permissionPresenter.showDetailedRequirements('setup', input.initialRequirements);
    },
    advanceToSetupPat: () => { input.journey?.advance('setup-pat'); },
    revisitChoices: () => input.journey!.revisitChoices(),
  }).execute({ owner: input.owner, repository: input.repository, overrides: input.overrides,
    skipRepositoryVariables: input.skipRepositoryVariables, skipRepositorySecrets: input.skipRepositorySecrets });
  if (prepared.kind !== 'guided') return { requirements: input.initialRequirements };
  credentialPrompt.configureSetupPatGuide(prepared.url);
  return { requirements: [...prepared.requirements], assertedOwnerKind: prepared.ownerKind,
    permissionIntent: prepared.permissionIntent };
}
