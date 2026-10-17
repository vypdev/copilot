import { executeSetupBatch } from '../setup_batch_adapter';
import { WebSetupBridge } from '../web_setup_bridge';
import { WebSetupCredentialPrompt, WebSetupPermissionPresenter } from '../web_setup_adapters';
import { createSetupBatchCompositionRoot } from '../../infrastructure/composition/setup_batch_composition_root';
import { createSetupCredentialsUseCase, createSetupRemoteConfigurationReadPort } from '../../infrastructure/composition/setup_credentials_composition_root';
import { createSetupTokenPermissionsUseCase } from '../../infrastructure/composition/setup_token_permissions_composition_root';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import { buildSetupRepositoryVariables } from '../../application/policies/setup_configuration_plan';
import type { SetupBatchOperation } from '../../domain/setup_batch';
import type { SetupRemoteConfiguration } from '../../domain/setup';
import type { WebSetupPrompt } from '../../application/contracts/web_setup_view';
import type { SetupTokenPermissionReport } from '../../domain/setup_token_permissions';
jest.mock('../../infrastructure/composition/setup_batch_composition_root', () => ({ createSetupBatchCompositionRoot: jest.fn() }));
jest.mock('../../infrastructure/composition/setup_credentials_composition_root', () => ({ createSetupCredentialsUseCase: jest.fn(), createSetupRemoteConfigurationReadPort: jest.fn() }));
jest.mock('../../infrastructure/composition/setup_token_permissions_composition_root', () => ({ createSetupTokenPermissionsUseCase: jest.fn() }));
jest.mock('../../infrastructure/composition/setup_doctor_composition_root', () => ({ createSetupMergeQueueReadinessUseCase: () => ({ inspect: async () => [] }) }));
jest.mock('../../infrastructure/github_setup_project_discovery_adapter', () => ({ GithubSetupProjectDiscoveryAdapter: class { async discover() { return { status: 'empty', candidates: [] }; } } }));

function fixture(pendingSecret = false) {
  const configuration = createDefaultSetupConfiguration(); configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' }; configuration.createInitialTag = false;
  const targets = [7, 8].map(id => ({ id, ownerId: 3, owner: 'acme', name: `repo-${id}`, defaultBranch: 'master', baseSha: 'a'.repeat(40), private: true, archived: false, disabled: false, canPush: true }));
  const remote = (id: number): SetupRemoteConfiguration => ({ ownerType: 'Organization', repositoryId: id, defaultBranch: 'master', repositoryVisibility: 'private',
    repositoryVariables: [], repositoryVariablesAccess: 'available', organizationVariables: buildSetupRepositoryVariables(configuration), organizationVariablesAccess: 'available',
    repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: pendingSecret ? [] : ['PAT'],
    organizationSecretRevisions: pendingSecret ? [] : [{ name: 'PAT', updatedAt: '2026-10-17T00:00:00Z' }],
    organizationSecretsAccess: 'available', organizationAccess: 'available' });
  const shared = [...buildSetupRepositoryVariables(configuration).map(variable => ({ ...variable, kind: 'variable', visibility: 'all', updatedAt: '2026-10-17T00:00:00Z', selectedRepositoryIds: [] })),
    { kind: 'secret', name: 'PAT', visibility: pendingSecret ? 'selected' : 'all', updatedAt: '2026-10-17T00:00:00Z', selectedRepositoryIds: [] }];
  let saved: SetupBatchOperation | undefined;
  const writer = { revalidate: jest.fn(async () => true), grant: jest.fn(async () => undefined), variables: jest.fn(async () => undefined), labels: jest.fn(async () => undefined),
    issueTypes: jest.fn(async () => undefined), prepareCommit: jest.fn(async () => 'c'.repeat(40)), branch: jest.fn(async () => undefined), pullRequest: jest.fn(async () => 31) };
  const composition = { discovery: { resolve: jest.fn(async (_owner: string, name: string) => targets.find(target => target.name === name)!), list: jest.fn(async () => ({ targets, truncated: false })) },
    inventory: { branchExists: async () => true, shared: async () => shared, effective: async (target: typeof targets[number]) => remote(target.id), files: async () => [] },
    renderer: { operationId: () => 'a67c8e40-93be-43ed-a7ed-e07378c7e773', digest: () => 'b'.repeat(64), render: async () => [{ path: 'AGENTS.md', content: 'generated' }] },
    journal: { load: async () => saved, save: async (operation: SetupBatchOperation) => { saved = operation; }, lock: async () => async () => undefined }, writer };
  (createSetupBatchCompositionRoot as jest.Mock).mockReturnValue(composition);
  (createSetupRemoteConfigurationReadPort as jest.Mock).mockReturnValue({ inspect: async () => remote(7), inspectCredentialHealthWorkflow: async () => 'installed' });
  const credentials = { collect: jest.fn(async () => ({ collection: { apiKeys: [], retainedSecrets: [] } })) };
  (createSetupCredentialsUseCase as jest.Mock).mockReturnValue(credentials);
  const report: SetupTokenPermissionReport = { role: 'setup', ready: true, identityStatus: 'valid', identityMessage: 'fixture identity', account: 'operator', checks: [], confirmationRequired: false };
  const inspect = jest.fn(async () => report); (createSetupTokenPermissionsUseCase as jest.Mock).mockReturnValue({ inspect });
  const bridge = new WebSetupBridge('acme/repo-7');
  let selectionAction = 'select'; let batchApprovals = 0; let retry = false;
  const prompts: WebSetupPrompt[] = [];
  jest.spyOn(bridge, 'ask').mockImplementation(async prompt => {
    prompts.push(prompt);
    if (prompt.kind === 'repositories') {
      if (selectionAction === 'access') { selectionAction = 'select'; return JSON.stringify({ action: 'access', selectedIds: [7, 8] }); }
      if (selectionAction === 'resolve') { selectionAction = 'select'; return JSON.stringify({ action: 'resolve', selectedIds: [7], name: 'repo-8' }); }
      return JSON.stringify({ action: 'select', selectedIds: [7, 8] });
    }
    if (prompt.kind === 'secret') return 'replacement-private-token';
    if (prompt.kind === 'question') return '';
    if (prompt.kind === 'plan') return 'approve';
    if (prompt.kind === 'batch-plan') { batchApprovals += 1; return 'approve'; }
    if (prompt.kind === 'batch-result') { if (retry && prompt.batch.retryRemaining) { retry = false; return 'retry'; } return 'finish'; }
    return prompt.kind === 'choice' || prompt.kind === 'confirm' ? prompt.choices[0] : undefined;
  });
  const input = { owner: 'acme', repository: 'repo-7', token: 'private-operator-token', configurationSource: 'organization' as const, presentationMode: 'basic' as const,
    overrides: { pullRequestApproval: { mode: 'off' as const } }, skipVariables: false, skipSecrets: false, provisionalRequirements: [], bridge,
    credentialPrompt: new WebSetupCredentialPrompt(bridge), permissionPresenter: new WebSetupPermissionPresenter(bridge), present: jest.fn(), possibleMutation: jest.fn() };
  return { input, bridge, prompts, composition, credentials, writer, inspect, report, approvals: () => batchApprovals,
    selection: (value: string) => { selectionAction = value; }, retry: () => { retry = true; } };
}
beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); });
describe('real batch entrypoint composition with deterministic provider ports', () => {
  it('carries inspected Secret revisions through pending additive-grant planning into the real wizard', async () => {
    const f = fixture(true); const result = await executeSetupBatch(f.input);
    expect(result.outcome).toBe('complete'); expect(f.writer.grant).toHaveBeenCalledTimes(2);
    expect(f.writer.grant).toHaveBeenNthCalledWith(1, expect.anything(), { kind: 'secret', name: 'PAT', repositoryId: 7 }, expect.any(String));
    expect(f.writer.grant).toHaveBeenNthCalledWith(2, expect.anything(), { kind: 'secret', name: 'PAT', repositoryId: 8 }, expect.any(String));
    expect(f.approvals()).toBe(1);
  });
  it('runs the shared configuration and Apply flow, leaving two PRs waiting for merge', async () => {
    const f = fixture(); const result = await executeSetupBatch(f.input);
    expect(result.outcome).toBe('complete'); expect(result.operation.targets.map(target => target.status)).toEqual(['waiting-for-merge', 'waiting-for-merge']);
    expect(f.writer.pullRequest).toHaveBeenCalledTimes(2); expect(f.credentials.collect).toHaveBeenCalledTimes(2); expect(f.approvals()).toBe(1);
    expect(f.prompts.filter(prompt => prompt.kind === 'question').every(prompt => prompt.kind !== 'question' || !prompt.question.id.startsWith('storage.'))).toBe(true);
    expect(JSON.stringify(f.bridge.snapshot())).not.toContain('private-operator-token');
  });
  it('reconnects a limited selected-target PAT without serializing it', async () => {
    const f = fixture(); f.selection('access'); await executeSetupBatch(f.input);
    expect(f.prompts.some(prompt => prompt.kind === 'secret' && prompt.copyId === 'batch.token')).toBe(true);
    expect(f.composition.discovery.list).toHaveBeenCalledTimes(2); expect(JSON.stringify(f.bridge.snapshot())).not.toContain('replacement-private-token');
  });
  it('uses exact-name lookup without silently selecting another target', async () => {
    const f = fixture(); f.selection('resolve'); await executeSetupBatch(f.input);
    expect(f.composition.discovery.resolve).toHaveBeenCalledWith('acme', 'repo-8', 'private-operator-token');
  });
  it('retains successful target effects and reviews an explicit retry of unfinished work', async () => {
    const f = fixture(); f.writer.branch.mockRejectedValueOnce(new Error('uncertain response')); f.retry();
    const result = await executeSetupBatch(f.input); expect(result.outcome).toBe('complete'); expect(f.approvals()).toBe(2);
    expect(f.writer.variables).toHaveBeenCalledTimes(2); expect(f.writer.branch).toHaveBeenCalledTimes(3);
  });
  it('preserves the failed permission report and blocks installation on cleanup', async () => {
    const f = fixture(); f.inspect.mockImplementation(async () => ({ ...f.report, ready: false,
      checks: [{ id: 'setup.repository.contents', reason: 'fixture permission', probe: 'contents', message: 'fixture denial', role: 'setup', scope: 'repository', permission: 'Contents', level: 'write', applicability: 'required', status: 'missing', cleanupPending: true }] } as SetupTokenPermissionReport));
    const result = await executeSetupBatch(f.input); expect(result.outcome).toBe('partial'); expect(f.writer.pullRequest).not.toHaveBeenCalled();
    expect(f.bridge.snapshot().permissions?.report?.checks[0].cleanupPending).toBe(true);
  });
  it('requires IDs or explicit confirmation in the terminal and ignores an untouched blank selection', async () => {
    const f = fixture(); let selections = 0; let questions = 0;
    const readText = jest.fn(async (prompt: string) => {
      if (++questions > 200) throw new Error('Unexpected questionnaire loop');
      if (prompt.startsWith('Selected:')) return { kind: 'value' as const, value: ++selections === 1 ? '' : 'confirm' };
      return { kind: 'value' as const, value: prompt.startsWith('Use this configuration') ? 'yes' : prompt.startsWith('Apply the ready plans?') ? 'apply' : '' };
    });
    const terminal = { isInteractive: () => true, readText, readSecret: jest.fn(), close: jest.fn() };
    const result = await executeSetupBatch({ ...f.input, bridge: undefined, terminal });
    expect(selections).toBe(2); expect(result.operation.targets.map(target => target.repositoryId)).toEqual([7]);
    expect(f.writer.pullRequest).toHaveBeenCalledTimes(1);
  });
  it('supports explicit terminal IDs, an exact-name lookup and one reviewed partial retry', async () => {
    const f = fixture(); f.writer.branch.mockRejectedValueOnce(new Error('response uncertain')); let selections = 0;
    const readText = jest.fn(async (prompt: string) => {
      if (prompt.startsWith('Selected:')) return { kind: 'value' as const, value: ++selections === 1 ? 'name:repo-8' : '7,8' };
      const value = prompt.startsWith('Use this configuration') ? 'yes' : prompt.startsWith('Apply the ready plans?') ? 'apply'
        : prompt.startsWith('Inspect existing effects') ? 'retry' : '';
      return { kind: 'value' as const, value };
    });
    const terminal = { isInteractive: () => true, readText, readSecret: jest.fn(), close: jest.fn() };
    expect((await executeSetupBatch({ ...f.input, bridge: undefined, terminal })).outcome).toBe('complete');
    expect(f.writer.pullRequest).toHaveBeenCalledTimes(2); expect(f.writer.branch).toHaveBeenCalledTimes(3);
  });

});
