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
  const useCase = new ApplySetupBatchUseCase({ journal, writer, presentation });
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
});
