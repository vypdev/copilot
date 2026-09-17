import { ReconcileBranchReadinessUseCase } from '../reconcile_branch_readiness_use_case';

const sha = 'a'.repeat(40);

function makePorts(initial: string[], linked = true) {
  let labels = [...initial];
  const getLinkedBranch = jest.fn().mockResolvedValue(linked ? { name: 'feature/42-change', headSha: sha } : undefined);
  const setLabels = jest.fn(async (_issue: number, next: readonly string[]) => { labels = [...next]; });
  const useCase = new ReconcileBranchReadinessUseCase(
    { getLinkedBranch },
    { getLabels: jest.fn(async () => labels), setLabels },
  );
  return { useCase, getLinkedBranch, setLabels, current: () => labels };
}

describe('linked branch readiness reconciliation', () => {
  it('adds branched only after the exact linked remote ref is found', async () => {
    const ports = makePorts(['feature', 'in-progress']);
    const results = await ports.useCase.invoke({ issueNumber: 42, branchName: 'feature/42-change', sddRequired: false, sddPublished: false });
    expect(results[0]).toMatchObject({ success: true, executed: true });
    expect(ports.getLinkedBranch).toHaveBeenCalledWith(42, 'feature/42-change');
    expect(ports.current()).toEqual(['feature', 'in-progress', 'branched']);
  });

  it.each([
    ['unlinked branch', false, false, false],
    ['required SDD missing', true, true, false],
    ['SDD revision pending', true, true, true],
  ])('removes a manually applied label when %s', async (_name, linked, sddRequired, revisionPending) => {
    const ports = makePorts(['feature', 'branched'], linked);
    await ports.useCase.invoke({ issueNumber: 42, branchName: 'feature/42-change', sddRequired, sddPublished: false, revisionPending });
    expect(ports.current()).toEqual(['feature']);
  });

  it('requires an SDD publication fact and remains idempotent on replay', async () => {
    const ports = makePorts(['feature', 'in-progress']);
    const context = { issueNumber: 42, branchName: 'feature/42-change', sddRequired: true, sddPublished: true };
    await ports.useCase.invoke(context);
    const replay = await ports.useCase.invoke(context);
    expect(ports.current()).toContain('branched');
    expect(ports.setLabels).toHaveBeenCalledTimes(1);
    expect(replay[0]).toMatchObject({ success: true, executed: false });
  });

  it('fails closed when the provider cannot verify remote evidence', async () => {
    const ports = makePorts(['feature', 'in-progress']);
    ports.getLinkedBranch.mockRejectedValue(new Error('provider unavailable'));
    const results = await ports.useCase.invoke({ issueNumber: 42, branchName: 'feature/42-change', sddRequired: false, sddPublished: false });
    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(ports.setLabels).not.toHaveBeenCalled();
  });

  it('removes stale branched evidence when the provider becomes unavailable', async () => {
    const ports = makePorts(['feature', 'branched']);
    ports.getLinkedBranch.mockRejectedValue(new Error('provider unavailable'));
    const results = await ports.useCase.invoke({ issueNumber: 42, branchName: 'feature/42-change', sddRequired: false, sddPublished: false });
    expect(results[0].success).toBe(false);
    expect(ports.current()).toEqual(['feature']);
  });
});
