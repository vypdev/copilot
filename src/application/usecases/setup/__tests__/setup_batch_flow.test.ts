import { createHash } from 'node:crypto';
import { PrepareSetupBatchUseCase } from '../prepare_setup_batch_use_case';
import { ConfigureSetupBatchTargetUseCase } from '../configure_setup_batch_target_use_case';
import { SetupBatchSessionUseCase } from '../setup_batch_session_use_case';
import { ApplySetupBatchUseCase } from '../apply_setup_batch_use_case';
import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_defaults';
import { buildSetupRepositoryVariables, buildSetupPlan } from '../../../policies/setup_configuration_plan';
import { beginSetupBatchOperation } from '../../../policies/setup_batch_policy';
import { SetupInteractionCancelledError } from '../../../errors/setup_interaction_cancelled_error';
import type { SetupBatchOperation, SetupBatchTarget, SetupBatchSharedResource } from '../../../../domain/setup_batch';
import type { SetupRemoteConfiguration } from '../../../../domain/setup';

const id = 'a67c8e40-93be-43ed-a7ed-e07378c7e773';
function fixture() {
  const configuration = createDefaultSetupConfiguration(); configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' }; configuration.createInitialTag = false;
  const targets: SetupBatchTarget[] = [7, 8].map(number => ({ id: number, ownerId: 3, owner: 'acme', name: `repo-${number}`,
    defaultBranch: 'master', baseSha: 'a'.repeat(40), private: true, archived: false, disabled: false, canPush: true }));
  const shared: SetupBatchSharedResource[] = [...buildSetupRepositoryVariables(configuration).map(variable => ({ kind: 'variable' as const,
    ...variable, visibility: 'all' as const, updatedAt: '2026-10-17T00:00:00Z', selectedRepositoryIds: [] })),
    { kind: 'secret', name: 'PAT', visibility: 'selected', updatedAt: '2026-10-17T00:00:00Z', selectedRepositoryIds: [] }];
  const remote = (target: SetupBatchTarget): SetupRemoteConfiguration => ({ ownerType: 'Organization', repositoryId: target.id,
    defaultBranch: target.defaultBranch, repositoryVisibility: 'private', repositoryVariables: [], repositoryVariablesAccess: 'available',
    organizationVariables: buildSetupRepositoryVariables(configuration), organizationVariablesAccess: 'available', repositorySecrets: [],
    repositorySecretsAccess: 'available', organizationSecrets: [], organizationSecretsAccess: 'available', organizationAccess: 'available' });
  const discovery = { resolve: jest.fn(async (_owner: string, name: string) => targets.find(target => target.name === name)!),
    list: jest.fn(async () => ({ targets, truncated: false })) };
  const inventory = { branchExists: jest.fn(async () => true as boolean | undefined), shared: jest.fn(async () => shared), effective: jest.fn(async (target: SetupBatchTarget) => remote(target)), files: jest.fn(async () => []) };
  const renderer = { operationId: () => id, digest: (value: string) => createHash('sha256').update(value).digest('hex'),
    render: jest.fn(async () => [{ path: 'AGENTS.md', content: 'generated guidance' }]) };
  const configure = jest.fn(async () => ({ configuration } as { configuration: typeof configuration; blocked?: readonly string[] }));
  const ports = { discovery, inventory, renderer, configure, active: jest.fn(() => true) };
  const request = { organization: 'acme', selected: targets.map(target => ({ id: target.id, name: target.name })), token: 'private-operator-token' };
  return { configuration, targets, shared, remote, ports, request, prepare: new PrepareSetupBatchUseCase(ports) };
}

describe('read-only per-target preparation', () => {
  it('reads shared inventory once and plans only additive bindings for selected identities', async () => {
    const f = fixture(); const plan = await f.prepare.execute(f.request);
    expect(f.ports.inventory.shared).toHaveBeenCalledTimes(1);
    expect(plan.targets.every(target => !target.blocked.length)).toBe(true);
    expect(plan.targets.map(target => target.grants)).toEqual([[{ kind: 'secret', name: 'PAT', repositoryId: 7 }], [{ kind: 'secret', name: 'PAT', repositoryId: 8 }]]);
    expect(plan.targets.every(target => target.repositoryVariables.length === 0)).toBe(true);
    expect(JSON.stringify(plan)).not.toContain('private-operator-token');
  });
  it('keeps an unknown inventory blocked without asking its questionnaire or blocking other targets', async () => {
    const f = fixture(); f.ports.inventory.effective.mockRejectedValueOnce(new Error('private response'));
    const plan = await f.prepare.execute(f.request);
    expect(plan.targets[0].blocked[0]).toContain('inventory is unavailable');
    expect(plan.targets[0].remote.repositorySecretsAccess).toBe('unavailable');
    expect(plan.targets[0].grants).toEqual([]); expect(plan.targets[1].blocked).toEqual([]);
    expect(f.ports.configure).toHaveBeenCalledTimes(1); expect(JSON.stringify(plan)).not.toContain('private response');
  });
  it('blocks unsupported files independently before proposing changes', async () => {
    const f = fixture(); f.ports.inventory.files.mockRejectedValueOnce(new Error('symlink'));
    const plan = await f.prepare.execute(f.request);
    expect(plan.targets[0].blocked[0]).toContain('files could not'); expect(plan.targets[0].files).toEqual([]);
    expect(plan.targets[1].blocked).toEqual([]);
  });
  it('does not render files for missing existing credentials', async () => {
    const f = fixture(); f.shared.pop(); const plan = await f.prepare.execute(f.request);
    expect(plan.targets.every(target => target.blocked.some(reason => reason.includes('PAT')))).toBe(true);
    expect(f.ports.renderer.render).not.toHaveBeenCalled();
  });
  it.each([false, undefined])('blocks only a target with unestablished development branch %s', async exists => {
    const f = fixture(); f.ports.inventory.branchExists.mockResolvedValueOnce(exists);
    const plan = await f.prepare.execute(f.request); expect(plan.targets[0].blocked[0]).toContain('branch');
    expect(plan.targets[0].files).toEqual([]); expect(plan.targets[1].blocked).toEqual([]);
  });
  it('keeps an explicitly blocked configuration as its own result', async () => {
    const f = fixture(); f.ports.configure.mockResolvedValueOnce({ configuration: f.configuration, blocked: ['Target approval needs review.'] });
    const plan = await f.prepare.execute(f.request); expect(plan.targets[0].blocked).toEqual(['Target approval needs review.']);
    expect(plan.targets[0].sharedSnapshot).toEqual([]); expect(plan.targets[1].blocked).toEqual([]);
  });
  it('keeps desired plan digests stable after its own access grant', async () => {
    const f = fixture(); const before = await f.prepare.execute(f.request);
    f.shared[f.shared.length - 1] = { ...f.shared[f.shared.length - 1], selectedRepositoryIds: [7] };
    const after = await f.prepare.execute({ ...f.request, operationId: id });
    expect(after.targets[0].grants).toEqual([]); expect(after.targets[0].digest).toBe(before.targets[0].digest);
  });
  it.each([{ selected: [] }, { selected: [{ id: 7, name: 'repo-7' }, { id: 7, name: 'repo-7' }] }, { operationId: '../bad' }])('rejects invalid operation scope %j', async invalid => {
    const f = fixture(); await expect(f.prepare.execute({ ...f.request, ...invalid })).rejects.toThrow();
    expect(f.ports.configure).not.toHaveBeenCalled();
  });
  it('rejects a replaced repository identity before shared inventory', async () => {
    const f = fixture(); f.ports.discovery.resolve.mockResolvedValueOnce({ ...f.targets[0], id: 99 });
    await expect(f.prepare.execute(f.request)).rejects.toThrow('identity changed'); expect(f.ports.inventory.shared).not.toHaveBeenCalled();
  });
  it('cancels before inspecting more repositories', async () => {
    const f = fixture(); f.ports.active.mockReturnValue(false);
    await expect(f.prepare.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError);
    expect(f.ports.discovery.resolve).not.toHaveBeenCalled();
  });
});

async function sessionFixture() {
  const f = fixture(); const plan = await f.prepare.execute(f.request); let saved: SetupBatchOperation | undefined;
  const journal = { load: jest.fn(async () => saved), save: jest.fn(async (operation: SetupBatchOperation) => { saved = operation; }), lock: jest.fn(async () => async () => undefined) };
  const writer = { revalidate: jest.fn(async () => true), grant: jest.fn(async () => undefined), variables: jest.fn(async () => undefined),
    labels: jest.fn(async () => undefined), issueTypes: jest.fn(async () => undefined), prepareCommit: jest.fn(async () => 'c'.repeat(40)),
    branch: jest.fn(async () => undefined), pullRequest: jest.fn(async () => 31) };
  const presentation = { review: jest.fn(async () => true), active: jest.fn(() => true), progress: jest.fn() };
  const apply = new ApplySetupBatchUseCase({ writer, journal, presentation: { ...presentation, review: async () => true } });
  const ports = { selection: { execute: jest.fn(async () => ({ token: f.request.token, selected: f.request.selected })) },
    prepare: { execute: jest.fn(async () => plan) }, writer, apply, journal, presentation, result: jest.fn(async () => 'finish' as 'finish' | 'retry'),
    planning: jest.fn(), possibleMutation: jest.fn(), audit: jest.fn(async () => ({ ready: true } as { ready: boolean; cleanupPending?: boolean })) };
  return { ...f, plan, ports, session: new SetupBatchSessionUseCase(ports), request: { organization: 'acme', currentRepository: 'repo-7', token: f.request.token },
    save: (operation: SetupBatchOperation) => { saved = operation; } };
}
describe('shared CLI/web batch session', () => {
  it('requires batch approval before temporary probes and installs sequentially', async () => {
    const f = await sessionFixture(); f.ports.audit.mockImplementation(async () => {
      expect(f.ports.presentation.review).toHaveBeenCalledTimes(1); expect(f.ports.possibleMutation).toHaveBeenCalled(); return { ready: true };
    });
    const result = await f.session.execute(f.request); expect(result.outcome).toBe('complete');
    expect(result.operation.targets.map(target => target.status)).toEqual(['waiting-for-merge', 'waiting-for-merge']);
    expect(f.ports.audit).toHaveBeenCalledTimes(2);
  });
  it('declines without creating a journal or probing permissions', async () => {
    const f = await sessionFixture(); f.ports.presentation.review.mockResolvedValue(false);
    expect((await f.session.execute(f.request)).outcome).toBe('cancelled');
    expect(f.ports.audit).not.toHaveBeenCalled(); expect(f.ports.journal.save).not.toHaveBeenCalled();
  });
  it('freshly revalidates every target before permission probes', async () => {
    const f = await sessionFixture(); f.ports.writer.revalidate.mockResolvedValue(false);
    const result = await f.session.execute(f.request); expect(result.outcome).toBe('blocked');
    expect(f.ports.audit).not.toHaveBeenCalled(); expect(f.ports.possibleMutation).not.toHaveBeenCalled(); expect(f.ports.writer.grant).not.toHaveBeenCalled();
  });
  it('keeps a provider read failure local to its target before probes', async () => {
    const f = await sessionFixture(); f.ports.writer.revalidate.mockRejectedValueOnce(new Error('private provider response'));
    const result = await f.session.execute(f.request);
    expect(result.operation.targets.map(target => target.status)).toEqual(['blocked', 'waiting-for-merge']);
    expect(result.operation.targets[0].reason).toBe('provider'); expect(f.ports.audit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('private provider response');
  });
  it('blocks a failed permission target while allowing the other reviewed target', async () => {
    const f = await sessionFixture(); f.ports.audit.mockResolvedValueOnce({ ready: false });
    const result = await f.session.execute(f.request); expect(result.operation.targets.map(target => target.status)).toEqual(['blocked', 'waiting-for-merge']);
    expect(f.ports.writer.grant).toHaveBeenCalledTimes(1);
  });
  it('stops the whole installation when a permission probe needs cleanup', async () => {
    const f = await sessionFixture(); f.ports.audit.mockResolvedValueOnce({ ready: false, cleanupPending: true });
    expect((await f.session.execute(f.request)).outcome).toBe('partial'); expect(f.ports.writer.grant).not.toHaveBeenCalled();
    expect(f.ports.audit).toHaveBeenCalledTimes(1); expect(f.ports.result).toHaveBeenCalledWith(f.plan, expect.anything(), 0);
  });
  it('allows one explicit reviewed retry and skips completed repositories and effects', async () => {
    const f = await sessionFixture(); f.ports.writer.branch.mockRejectedValueOnce(new Error('timeout'));
    f.ports.result.mockResolvedValueOnce('retry');
    const result = await f.session.execute(f.request); expect(result.outcome).toBe('complete');
    expect(f.ports.presentation.review).toHaveBeenCalledTimes(2); expect(f.ports.writer.variables).toHaveBeenCalledTimes(2);
    expect(f.ports.writer.branch).toHaveBeenCalledTimes(3); expect(f.ports.audit).toHaveBeenCalledTimes(3);
  });
  it('does not offer unlimited retries for repeatedly incomplete work', async () => {
    const f = await sessionFixture(); f.ports.writer.branch.mockRejectedValue(new Error('timeout')); f.ports.result.mockResolvedValue('retry');
    expect((await f.session.execute(f.request)).outcome).toBe('partial'); expect(f.ports.presentation.review).toHaveBeenCalledTimes(2);
    expect(f.ports.writer.branch).toHaveBeenCalledTimes(4);
  });
  it('resumes only exact saved identities and a freshly re-created matching plan', async () => {
    const f = await sessionFixture(); const prior = beginSetupBatchOperation(f.plan); f.save(prior);
    const result = await f.session.execute({ ...f.request, resumeOperationId: id }); expect(result.outcome).toBe('complete');
    expect(f.ports.selection.execute).not.toHaveBeenCalled(); expect(f.ports.prepare.execute).toHaveBeenCalledWith(expect.objectContaining({ operationId: id, selected: f.targets.map(target => ({ id: target.id, name: target.name })) }));
  });
  it('rejects stale saved plans before approval, probes or writes', async () => {
    const f = await sessionFixture(); const prior = beginSetupBatchOperation(f.plan);
    f.save({ ...prior, targets: prior.targets.map(target => ({ ...target, planDigest: 'f'.repeat(64) })) });
    await expect(f.session.execute({ ...f.request, resumeOperationId: id })).rejects.toThrow('does not match'); expect(f.ports.audit).not.toHaveBeenCalled(); expect(f.ports.presentation.review).not.toHaveBeenCalled();
  });
  it('rejects a missing resume receipt before discovery or planning', async () => {
    const f = await sessionFixture(); await expect(f.session.execute({ ...f.request, resumeOperationId: id })).rejects.toThrow('not found');
    expect(f.ports.prepare.execute).not.toHaveBeenCalled();
  });
  it('shows all-blocked results without offering Apply', async () => {
    const f = await sessionFixture(); const blocked = { ...f.plan, targets: f.plan.targets.map(target => ({ ...target, blocked: ['Needs access.'] })) };
    f.ports.prepare.execute.mockResolvedValue(blocked);
    expect((await f.session.execute(f.request)).outcome).toBe('blocked'); expect(f.ports.presentation.review).not.toHaveBeenCalled(); expect(f.ports.audit).not.toHaveBeenCalled();
  });
});

describe('per-target shared wizard and metadata-only credentials', () => {
  function configureFixture() {
    const f = fixture(); const plan = buildSetupPlan(f.configuration); const result = { status: 'completed' as const, configuration: f.configuration,
      plan, exitCode: 0 as const, permissionIntent: undefined, questionnaire: undefined };
    const wizard = { execute: jest.fn().mockResolvedValue(result) };
    const credentials = { collect: jest.fn().mockResolvedValue({ collection: { apiKeys: [], retainedSecrets: [{ name: 'PAT', scope: 'organization', status: 'unverifiable' }] } }) };
    const useCase = new ConfigureSetupBatchTargetUseCase({ wizard, credentials });
    const request = { target: f.targets[0], remote: f.remote(f.targets[0]), actualRemote: f.remote(f.targets[0]), shared: f.shared,
      token: 'private-operator-token', configurationSource: 'organization' as const, presentationMode: 'basic' as const };
    return { ...f, wizard, credentials, useCase, request, result };
  }
  it('shares the preview wizard and marks planned credential access as pending', async () => {
    const f = configureFixture(); const result = await f.useCase.execute(f.request); expect(result?.blocked).toBeUndefined();
    expect(f.wizard.execute).toHaveBeenCalledWith(expect.objectContaining({ previewOnly: true, deliveryMode: 'pull-request' }));
    expect(f.credentials.collect).toHaveBeenCalledWith(expect.objectContaining({ configurationSource: 'organization', pendingOrganizationSecretNames: ['PAT'] }));
  });
  it.each([{ workflowPat: { name: 'PAT', value: 'private' }, apiKeys: [] }, { apiKeys: [{ name: 'OPENAI_API_KEY', value: 'private' }] }])('rejects credential values at the batch boundary %j', async collection => {
    const f = configureFixture(); f.credentials.collect.mockResolvedValue({ collection });
    expect((await f.useCase.execute(f.request))?.blocked?.[0]).toContain('credential did not pass');
  });
  it('keeps cancellation distinct from a credential failure', async () => {
    const f = configureFixture(); f.credentials.collect.mockRejectedValue(new SetupInteractionCancelledError());
    await expect(f.useCase.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError);
  });
  it('does not ask credentials for incomplete guarded approval', async () => {
    const f = configureFixture(); f.configuration.pullRequestApproval = { ...f.configuration.pullRequestApproval, mode: 'guarded' };
    expect((await f.useCase.execute(f.request))?.blocked?.[0]).toContain('Target-specific'); expect(f.credentials.collect).not.toHaveBeenCalled();
  });
  it('blocks missing bindings without attempting value prompts', async () => {
    const f = configureFixture(); f.shared.pop();
    expect((await f.useCase.execute(f.request))?.blocked?.[0]).toContain('existing credential binding'); expect(f.credentials.collect).not.toHaveBeenCalled();
  });
});
