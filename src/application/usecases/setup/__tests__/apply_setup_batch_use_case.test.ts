import { DeliverSetupInstallationUseCase } from '../deliver_setup_installation_use_case';
import { ApplySetupBatchUseCase } from '../apply_setup_batch_use_case';
import { beginSetupBatchOperation } from '../../../policies/setup_batch_policy';
import type { SetupBatchOperation, SetupBatchPlan } from '../../../../domain/setup_batch';

function fixture(count = 2) {
  const plan: SetupBatchPlan = { organization: 'acme', operationId: 'a67c8e40-93be-43ed-a7ed-e07378c7e773',
    targets: Array.from({ length: count }, (_, index) => ({ target: { id: index + 7, ownerId: 3, owner: 'acme', name: `repo-${index}`,
      defaultBranch: 'master', baseSha: 'a'.repeat(40), private: true, archived: false, disabled: false, canPush: true },
    digest: String(index + 1).repeat(64), blocked: [], files: [{ path: 'AGENTS.md', content: 'generated' }], grants: [] } as unknown as SetupBatchPlan['targets'][number])) };
  let saved: SetupBatchOperation | undefined;
  const unlock = jest.fn(async () => undefined);
  const journal = { load: jest.fn(async () => saved), save: jest.fn(async (operation: SetupBatchOperation) => { saved = operation; }), lock: jest.fn(async () => unlock) };
  const writer = { revalidate: jest.fn(async () => true), grant: jest.fn(async () => undefined), variables: jest.fn(async () => undefined),
    labels: jest.fn(async () => undefined), issueTypes: jest.fn(async () => undefined), prepareCommit: jest.fn(async () => 'c'.repeat(40)),
    branch: jest.fn(async () => undefined), pullRequest: jest.fn(async (_plan: SetupBatchPlan['targets'][number]) => 31) };
  const presentation = { review: jest.fn(async () => true), active: jest.fn(() => true), progress: jest.fn() };
  const useCase = new ApplySetupBatchUseCase({ coordinator: new DeliverSetupInstallationUseCase(), journal, writer, presentation });
  return { plan, journal, writer, presentation, unlock, useCase, saved: () => saved };
}
describe('sequential reviewed batch Apply', () => {
  it.each(['cancel', 'drift'] as const)('stops immediately at an effect boundary after %s', async reason => {
    const f = fixture(1);
    if (reason === 'cancel') f.presentation.active.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
    else f.writer.revalidate.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const result = await f.useCase.execute(f.plan, 'fixture');
    expect(result.targets[0]).toMatchObject({ status: reason === 'cancel' ? 'cancelled' : 'blocked', reason: reason === 'cancel' ? 'cancelled' : 'drift', effects: [] });
    expect(f.writer.variables).not.toHaveBeenCalled(); expect(f.writer.branch).not.toHaveBeenCalled();
    expect(f.unlock).toHaveBeenCalledTimes(1);
  });
  it('cancels between additive grants without issuing a later access change', async () => {
    const f = fixture(1); const grants = [{ kind: 'secret' as const, name: 'PAT', repositoryId: 7 }, { kind: 'variable' as const, name: 'MODEL', repositoryId: 7 }];
    const plan = { ...f.plan, targets: [{ ...f.plan.targets[0], grants }] };
    f.writer.grant.mockImplementation(async () => { f.presentation.active.mockReturnValue(false); });
    const result = await f.useCase.execute(plan, 'fixture');
    expect(result.targets[0]).toMatchObject({ status: 'cancelled', reason: 'cancelled' });
    expect(f.writer.grant).toHaveBeenCalledTimes(1); expect(f.writer.variables).not.toHaveBeenCalled();
  });
  it.each(['revalidation', 'intent'] as const)('cancels during file preparation %s without dispatching objects', async boundary => {
    const f = fixture(1), save = f.journal.save.getMockImplementation()!;
    const resources = ['access', 'variables', 'labels', 'issue-types'] as const;
    let ready = false, resourceCompleteSaves = 0;
    f.writer.issueTypes.mockImplementation(async () => { ready = true; });
    f.writer.revalidate.mockImplementation(async () => {
      if (boundary === 'revalidation' && ready) f.presentation.active.mockReturnValue(false);
      return true;
    });
    f.journal.save.mockImplementation(async operation => {
      await save(operation);
      if (resources.every(effect => operation.targets[0].effects.includes(effect))
        && !operation.targets[0].preparedCommit) resourceCompleteSaves += 1;
      if (boundary === 'intent' && resourceCompleteSaves === 2) f.presentation.active.mockReturnValue(false);
    });
    const result = await f.useCase.execute(f.plan, 'fixture');
    expect(result.targets[0]).toMatchObject({ status: 'cancelled',
      reason: 'preflight', effects: resources });
    expect(f.writer.prepareCommit).not.toHaveBeenCalled(); expect(f.writer.branch).not.toHaveBeenCalled();
    expect(f.writer.pullRequest).not.toHaveBeenCalled(); expect(f.unlock).toHaveBeenCalledTimes(1);
  });
  it('completes resource-only setup as verification pending without creating a ref or PR', async () => {
    const f = fixture(1); const plan = { ...f.plan, targets: [{ ...f.plan.targets[0], files: [] }] };
    const result = await f.useCase.execute(plan, 'fixture');
    expect(result.targets[0]).toMatchObject({ status: 'verification-pending', effects: ['access', 'variables', 'labels', 'issue-types'] });
    expect(f.writer.prepareCommit).not.toHaveBeenCalled(); expect(f.writer.branch).not.toHaveBeenCalled(); expect(f.writer.pullRequest).not.toHaveBeenCalled();
  });
  it('persists every completed effect and truthfully stops at waiting for merge', async () => {
    const f = fixture(); const order: number[] = [];
    f.writer.pullRequest.mockImplementation(async target => { order.push(target.target.id); return 31; });
    const result = await f.useCase.execute(f.plan, 'fixture-operator-token');
    expect(order).toEqual([7, 8]);
    expect(result.targets.every(target => target.status === 'waiting-for-merge')).toBe(true);
    expect(result.targets[0]).toMatchObject({ effects: ['access', 'variables', 'labels', 'issue-types', 'branch', 'pull-request'],
      preparedCommit: 'c'.repeat(40), pullRequestNumber: 31 });
    expect(JSON.stringify(f.saved())).not.toContain('fixture-operator-token');
    expect(JSON.stringify(f.saved())).not.toContain('generated');
    expect(f.unlock).toHaveBeenCalledTimes(1);
  });
  it('retries only unfinished effects and never repeats a completed target', async () => {
    const f = fixture(); f.writer.branch.mockRejectedValueOnce(new Error('private provider details'));
    const first = await f.useCase.execute(f.plan, 'fixture');
    expect(first.targets.map(target => target.status)).toEqual(['partial', 'waiting-for-merge']);
    expect(JSON.stringify(first)).not.toContain('private');
    const second = await f.useCase.execute(f.plan, 'fixture');
    expect(second.targets.every(target => target.status === 'waiting-for-merge')).toBe(true);
    expect(f.writer.variables).toHaveBeenCalledTimes(2);
    expect(f.writer.prepareCommit).toHaveBeenCalledTimes(2);
    expect(f.writer.branch).toHaveBeenCalledTimes(3);
    expect(f.writer.pullRequest).toHaveBeenCalledTimes(2);
  });
  it('recovers an uncertain legacy PR by inspection without repeating resources, objects or its ref', async () => {
    const f = fixture(1); f.writer.pullRequest.mockRejectedValueOnce(new Error('lost PR response'));
    const first = await f.useCase.execute(f.plan, 'fixture');
    expect(first.targets[0]).toMatchObject({ status: 'partial', preparedCommit: 'c'.repeat(40),
      effects: ['access', 'variables', 'labels', 'issue-types', 'branch'] });
    const recovered = await f.useCase.execute(f.plan, 'fixture');
    expect(recovered.targets[0]).toMatchObject({ status: 'waiting-for-merge', pullRequestNumber: 31 });
    expect(f.writer.prepareCommit).toHaveBeenCalledTimes(1); expect(f.writer.branch).toHaveBeenCalledTimes(1);
    expect(f.writer.variables).toHaveBeenCalledTimes(1);
    expect(f.writer.pullRequest).toHaveBeenLastCalledWith(f.plan.targets[0], f.plan.operationId, 'c'.repeat(40), 'fixture', false, expect.any(Function));
    const active = (f.writer.pullRequest.mock.lastCall as unknown as readonly unknown[])[5] as () => boolean;
    expect(active()).toBe(true);
    f.presentation.active.mockReturnValue(false); expect(active()).toBe(false);
  });
  it('finishes a retained legacy PR receipt after an interrupted final status save without new effects', async () => {
    const f = fixture(1), first = await f.useCase.execute(f.plan, 'fixture');
    f.journal.load.mockResolvedValue({ ...first, targets: [{ ...first.targets[0], status: 'applying' }] });
    f.writer.prepareCommit.mockClear(); f.writer.branch.mockClear(); f.writer.pullRequest.mockClear(); f.writer.variables.mockClear();
    const recovered = await f.useCase.execute(f.plan, 'fixture');
    expect(recovered.targets[0]).toMatchObject({ status: 'waiting-for-merge', pullRequestNumber: 31, preparedCommit: 'c'.repeat(40) });
    expect(f.writer.prepareCommit).not.toHaveBeenCalled(); expect(f.writer.branch).not.toHaveBeenCalled();
    expect(f.writer.pullRequest).not.toHaveBeenCalled(); expect(f.writer.variables).not.toHaveBeenCalled();
  });
  it('persists a prepared commit before publishing its ref', async () => {
    const f = fixture(1);
    f.writer.branch.mockImplementation(async () => {
      expect(f.saved()?.targets[0].preparedCommit).toBe('c'.repeat(40));
      expect(f.saved()?.targets[0].effects).not.toContain('branch');
    });
    await f.useCase.execute(f.plan, 'fixture');
  });
  it('does not mutate or persist on declined approval', async () => {
    const f = fixture(); f.presentation.review.mockResolvedValue(false);
    await f.useCase.execute(f.plan, 'fixture');
    expect(f.journal.save).not.toHaveBeenCalled(); expect(f.writer.revalidate).not.toHaveBeenCalled();
  });
  it('refuses direct Apply when any saved target has uncertain permission cleanup', async () => {
    const f = fixture(); const operation = beginSetupBatchOperation(f.plan);
    const prior: SetupBatchOperation = { ...operation, targets: [{ ...operation.targets[0], status: 'blocked', cleanupPending: true }, operation.targets[1]] };
    f.journal.load.mockResolvedValue(prior);
    expect(await f.useCase.execute(f.plan, 'fixture')).toEqual(prior);
    expect(f.presentation.review).not.toHaveBeenCalled(); expect(f.writer.revalidate).not.toHaveBeenCalled();
    expect(f.journal.save).not.toHaveBeenCalled(); expect(f.unlock).toHaveBeenCalledTimes(1);
  });
  it('blocks stale targets independently and preserves other progress', async () => {
    const f = fixture(); f.writer.revalidate.mockResolvedValueOnce(false);
    const result = await f.useCase.execute(f.plan, 'fixture');
    expect(result.targets.map(target => target.status)).toEqual(['blocked', 'waiting-for-merge']);
    expect(f.writer.variables).toHaveBeenCalledTimes(1);
  });
  it('cancels pending targets without claiming completed effects were rolled back', async () => {
    const f = fixture();
    f.writer.pullRequest.mockImplementation(async () => { f.presentation.active.mockReturnValue(false); return 31; });
    const result = await f.useCase.execute(f.plan, 'fixture');
    expect(result.targets.map(target => target.status)).toEqual(['waiting-for-merge', 'cancelled']);
    expect(result.targets[0].effects).toContain('pull-request');
    expect(f.writer.variables).toHaveBeenCalledTimes(1);
  });
  it('rejects a second Apply while a first request owns the session', async () => {
    const f = fixture(1); let approve!: (approved: boolean) => void;
    f.presentation.review.mockImplementation(() => new Promise(resolve => { approve = resolve; }));
    const first = f.useCase.execute(f.plan, 'fixture');
    await new Promise(resolve => setImmediate(resolve));
    await expect(f.useCase.execute(f.plan, 'fixture')).rejects.toThrow('already active');
    approve(false); await first;
    expect(f.unlock).toHaveBeenCalledTimes(1);
  });
  it('rejects a stale resume plan before approval or mutation', async () => {
    const f = fixture(); const prior = beginSetupBatchOperation(f.plan);
    f.journal.load.mockResolvedValue({ ...prior, targets: prior.targets.map(target => ({ ...target, planDigest: 'f'.repeat(64) })) });
    await expect(f.useCase.execute(f.plan, 'fixture')).rejects.toThrow('does not match');
    expect(f.presentation.review).not.toHaveBeenCalled(); expect(f.writer.variables).not.toHaveBeenCalled();
  });
  it('retains the strict v1 shape and does not repeat unknown prepared-object creation on resume', async () => {
    const f = fixture(1); f.writer.prepareCommit.mockRejectedValue(new Error('unknown object outcome'));
    const first = await f.useCase.execute(f.plan, 'fixture');
    expect(first.targets[0]).toMatchObject({ status: 'partial', effects: ['access', 'variables', 'labels', 'issue-types'] });
    expect(first.targets[0].cleanupPending).toBeUndefined();
    f.writer.prepareCommit.mockResolvedValue('c'.repeat(40));
    const resumed = await f.useCase.execute(f.plan, 'fixture');
    expect(resumed.targets[0].status).toBe('partial'); expect(f.writer.prepareCommit).toHaveBeenCalledTimes(1);
    expect(f.writer.branch).not.toHaveBeenCalled(); expect(f.writer.pullRequest).not.toHaveBeenCalled();
  });
  it('does not erase unknown preparation when an interrupted operation is marked cancelled', async () => {
    const f = fixture(1), prior = beginSetupBatchOperation(f.plan);
    f.journal.load.mockResolvedValue({ ...prior, targets: [{ ...prior.targets[0], status: 'cancelled', reason: 'cancelled',
      effects: ['access', 'variables', 'labels', 'issue-types'] }] });
    expect((await f.useCase.execute(f.plan, 'fixture')).targets[0]).toMatchObject({ status: 'partial', reason: 'provider' });
    expect(f.writer.prepareCommit).not.toHaveBeenCalled(); expect(f.writer.branch).not.toHaveBeenCalled();
  });
});

describe('confirmed preflight proof survives', () => {
  async function readyForRetry() {
    const f = fixture(1), prior = beginSetupBatchOperation(f.plan);
    await f.journal.save({ ...prior, targets: [{ ...prior.targets[0], status: 'partial', reason: 'preflight',
      effects: ['access', 'variables', 'labels', 'issue-types'] }] });
    return f;
  }
  it('another read failure before preparation retains its no-POST proof for the next reviewed retry', async () => {
    const f = await readyForRetry(); f.writer.revalidate.mockRejectedValueOnce(new Error('read unavailable'));
    const first = await f.useCase.execute(f.plan, 'fixture');
    expect(first.targets[0]).toMatchObject({ status: 'partial', reason: 'preflight' });
    expect(f.writer.prepareCommit).not.toHaveBeenCalled();
    expect((await f.useCase.execute(f.plan, 'fixture')).targets[0].status).toBe('waiting-for-merge');
    expect(f.writer.prepareCommit).toHaveBeenCalledTimes(1); expect(f.writer.variables).not.toHaveBeenCalled();
  });
  it('cancellation before target revalidation retains its no-POST proof for the next reviewed retry', async () => {
    const f = await readyForRetry(); f.presentation.active.mockReturnValueOnce(true).mockReturnValueOnce(false).mockReturnValue(true);
    const first = await f.useCase.execute(f.plan, 'fixture');
    expect(first.targets[0]).toMatchObject({ status: 'cancelled', reason: 'preflight' });
    expect(f.writer.revalidate).not.toHaveBeenCalled(); expect(f.writer.prepareCommit).not.toHaveBeenCalled();
    expect((await f.useCase.execute(f.plan, 'fixture')).targets[0].status).toBe('waiting-for-merge');
    expect(f.writer.prepareCommit).toHaveBeenCalledTimes(1); expect(f.writer.variables).not.toHaveBeenCalled();
  });
});
