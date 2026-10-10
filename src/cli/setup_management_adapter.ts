import { ManageSetupUseCase } from '../application/usecases/setup/manage_setup_use_case';
import { quickSetting } from '../application/policies/setup_quick_settings_policy';
import { setupQuestionContentInventory } from '../application/policies/setup_questionnaire_policy';
import { setupQuestionPresentation } from '../application/policies/setup_question_guidance_policy';
import { managementPermissions } from '../application/policies/setup_management_permissions_policy';
import { buildSetupPatCreationUrl } from '../application/policies/setup_pat_creation_url_policy';
import { SetupManagementWorkspaceAdapter } from '../infrastructure/setup_management_workspace_adapter';
import { createSetupRemoteConfigurationReadPort } from '../infrastructure/composition/setup_credentials_composition_root';
import { createRepositoryVariablesClient } from '../infrastructure/composition/github_identity_client_factory';
import { RepositoryVariablesCommandRepository } from '../data/repository/repository_variables_repository';
import { createSetupTokenPermissionsUseCase } from '../infrastructure/composition/setup_token_permissions_composition_root';
import { WebSetupPermissionPresenter } from './web_setup_adapters';
import type { SetupOperationEffect, SetupResourceScope, SetupRemoteConfiguration } from '../domain/setup';
import type { WebSetupBridge } from './web_setup_bridge';
import { getCurrentAttachedBranch, getCurrentHeadSha, getGitInfo } from '../cli_context';

/** Composition and presentation only; the application owns the edit transaction. */
export function manageWebSetup(bridge: WebSetupBridge, root: string, owner: string, repository: string,
  possibleMutation: () => void, record: (effect: SetupOperationEffect) => void, readOnly = false) {
  const workspace = new SetupManagementWorkspaceAdapter(root, () => JSON.stringify([
    getCurrentAttachedBranch(root), getCurrentHeadSha(), getGitInfo(),
  ]));
  const reader = createSetupRemoteConfigurationReadPort();
  const writer = new RepositoryVariablesCommandRepository(createRepositoryVariablesClient());
  const presenter = new WebSetupPermissionPresenter(bridge);
  const auditor = createSetupTokenPermissionsUseCase(presenter);
  bridge.setSurface('management');
  let requiredScope: SetupResourceScope | undefined;
  let ownerType: SetupRemoteConfiguration['ownerType'] | undefined;
  let approvalGeneration: number | undefined;
  return new ManageSetupUseCase({
    inspectLocal: () => workspace.inspect(),
    inspectRemote: token => reader.inspect(owner, repository, token),
    choose: async management => await bridge.ask({ kind: 'management', title: 'Copilot configuration', management }) as
      'wizard' | 'connect' | 'refresh' | 'close' | `edit:${string}` | undefined,
    requestToken: async () => {
      bridge.clearMessage();
      const requirements = managementPermissions(requiredScope, ownerType);
      presenter.showRequirements('setup', requirements);
      const link = buildSetupPatCreationUrl({ role: 'setup', owner, repository, expiresIn: 1, requirements });
      return bridge.ask({ kind: 'secret', title: 'Temporary setup PAT', optional: true, link,
        copyId: requiredScope ? 'management.tokenWrite' : 'management.token',
        description: requiredScope ? 'Use a setup PAT with Variables Write for the reviewed scope. Permission testing creates and removes one temporary Variable only after you approve the change. Leave blank to return to the panel.'
          : 'Read configuration from GitHub using a temporary setup PAT. Read access is sufficient for this panel; changes require Variables Write and a separate approval. Secrets are shown by name only. Leave blank to return to the panel.' });
    },
    requestValue: async (id, current) => {
      bridge.clearMessage();
      const setting = quickSetting(id)!;
      const question = setupQuestionContentInventory().find(item => item.id === setting.questionId)!;
      const value = await bridge.ask({ kind: 'quick-edit', title: 'Change a setting', id, current,
        presentation: setupQuestionPresentation(question),
        ...('choices' in setting ? { choices: setting.choices } : { min: setting.min, max: setting.max }) });
      return value === 'cancel' ? undefined : value;
    },
    confirm: async change => {
      const safeChange = { id: change.id, variable: change.variable, before: change.before, after: change.after, scope: change.scope };
      const approved = await bridge.ask({ kind: 'quick-review', title: 'Review this change', change: safeChange }) === 'approve';
      approvalGeneration = bridge.controllerGeneration();
      return approved;
    },
    audit: async (change, token, remote) => {
      bridge.managementMessage('checking');
      requiredScope = change.scope;
      ownerType = remote.ownerType;
      const requirements = managementPermissions(change.scope, ownerType);
      presenter.showRequirements('setup', requirements);
      const report = await auditor.inspect({ role: 'setup', owner, repository, token, requirements });
      presenter.showReport(report);
      if (!report.ready) bridge.resultReason('permissions');
      return report.checks.some(check => check.cleanupPending || check.incident) ? 'cleanup-pending' : report.ready ? 'accepted' : 'blocked';
    },
    write: async (change, token, remote) => change.scope === 'repository'
      ? writer.upsert(owner, repository, token, [{ name: change.variable, value: change.after }])
      : writer.upsertScopedVariables(owner, repository, token, { scope: 'organization', organizationVisibility: 'selected',
        repositoryId: remote.repositoryId }, [{ name: change.variable, value: change.after }]),
    notify: state => bridge.managementMessage(state),
    active: () => !bridge.snapshot().outcome,
    approvalCurrent: () => approvalGeneration === bridge.controllerGeneration(),
    possibleMutation,
    recordWrite: (success, scope) => {
      const effect: SetupOperationEffect = { id: 'variables', state: success ? 'completed' : 'needs-inspection', scope };
      record(effect); bridge.progress(effect);
      if (!success) bridge.resultReason('provider');
    },
  }, readOnly).execute().then(result => { if (result === 'continue') { bridge.clearMessage(); bridge.setSurface('wizard'); } return result; });
}
