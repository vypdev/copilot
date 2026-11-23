import { DeliverSetupInstallationUseCase } from '../deliver_setup_installation_use_case';
import { ApplySetupPublisherUseCase, SetupPublisherApplyError } from '../apply_setup_publisher_use_case';
import { ReviewSetupPublisherUseCase } from '../review_setup_publisher_use_case';
import { SetupInstallationSnapshotChanged } from '../../../ports/setup_installation_delivery_ports';
import type { SetupInstallationObjectObserver } from '../../../ports/setup_installation_delivery_ports';
import type { SetupPublisherApplyPorts } from '../../../ports/setup_publisher_apply_ports';
import type { SetupPublisherOperation } from '../../../../domain/setup_publisher_installation';
import { planSetupPublisherInstallation } from '../../../policies/setup_publisher_plan_policy';
import { parseSetupPublisherOperation } from '../../../policies/setup_publisher_installation_policy';
import { setupPublisherFixture } from '../../../policies/__tests__/fixtures/setup_publisher_fixture';

const id = '12345678-1234-4234-8234-123456789abc', tree = 'a'.repeat(40), commit = 'b'.repeat(40);
function fixture() {
  const data = setupPublisherFixture(), plan = planSetupPublisherInstallation(data.proposal, data.inspection, id), session = {};
  const empty: SetupPublisherOperation = { schemaVersion: 2, purpose: plan.purpose, operationId: id, repositoryId: plan.target.id,
    repository: `${plan.target.owner}/${plan.target.name}`, defaultBranch: plan.target.defaultBranch, baseSha: plan.target.baseSha,
    sourceCommit: plan.sourceCommit, planDigest: plan.digest, approvalDigest: plan.approvalDigest!, actorId: plan.actorId, status: 'ready', effects: [] };
  let saved: SetupPublisherOperation | undefined, locked = false;
  const states: SetupPublisherOperation[] = [], writes: string[] = [], reads: string[] = [];
  const journal = {
    load: jest.fn(async (_id: string) => saved),
    save: jest.fn(async (value: SetupPublisherOperation) => { saved = parseSetupPublisherOperation(value); states.push(saved); }),
    lock: jest.fn(async (_id: string) => { if (locked) throw new Error('private-lock-value'); locked = true; return release; }),
  };
  const release = jest.fn(async () => { locked = false; });
  const active = jest.fn(() => true), revalidate = jest.fn(async () => true);
  const writer = {
    prepareCommit: jest.fn(async (observe: SetupInstallationObjectObserver, retainedTree?: string) => {
      if (!retainedTree) { await observe({ effect: 'tree', state: 'starting' }); writes.push('tree'); await observe({ effect: 'tree', state: 'completed', sha: tree }); }
      await observe({ effect: 'commit', state: 'starting' }); writes.push('commit'); await observe({ effect: 'commit', state: 'completed', sha: commit }); return commit;
    }),
    branch: jest.fn(async (_commit: string, inspectOnly: boolean) => { (inspectOnly ? reads : writes).push('branch'); }),
    pullRequest: jest.fn(async (_commit: string, inspectOnly: boolean) => { (inspectOnly ? reads : writes).push('pull-request'); return 73; }),
  };
  const delivery = jest.fn<ReturnType<SetupPublisherApplyPorts['delivery']>, Parameters<SetupPublisherApplyPorts['delivery']>>(() => writer);
  const ports = { coordinator: new DeliverSetupInstallationUseCase(), journal, active, delivery };
  const execute = (reviewed?: SetupPublisherOperation) => new ApplySetupPublisherUseCase(ports).execute(plan, session, revalidate, reviewed);
  const retain = (value: SetupPublisherOperation | undefined) => { saved = value === undefined ? undefined : parseSetupPublisherOperation(value); };
  const completed = (effects: readonly ('tree' | 'commit' | 'branch' | 'pull-request')[] = ['tree', 'commit']) => parseSetupPublisherOperation({
    ...empty, status: 'partial', effects, preparedTree: tree, preparedCommit: commit,
    ...(effects.includes('pull-request') ? { pullRequestNumber: 73, status: 'waiting-for-merge' } : {}),
  });
  return { ...data, plan, session, empty, states, writes, reads, journal, release, active, revalidate, writer, delivery, ports, execute,
    retain, completed, saved: () => saved };
}

it('delivers through shared phases with each durable intent preceding its exact effect', async () => {
  const f = fixture(), prepare = f.writer.prepareCommit.getMockImplementation()!;
  f.writer.prepareCommit.mockImplementation(async (observe, known) => prepare(async event => {
    await observe(event);
    if (event.state === 'starting') expect(f.saved()?.uncertain).toBe(event.effect);
  }, known));
  const branch = f.writer.branch.getMockImplementation()!, pull = f.writer.pullRequest.getMockImplementation()!;
  f.writer.branch.mockImplementation(async (sha, inspect) => { expect(f.saved()?.uncertain).toBe('branch'); return branch(sha, inspect); });
  f.writer.pullRequest.mockImplementation(async (sha, inspect) => { expect(f.saved()?.uncertain).toBe('pull-request'); return pull(sha, inspect); });
  expect(await f.execute()).toEqual({ ...f.empty, status: 'waiting-for-merge', effects: ['tree', 'commit', 'branch', 'pull-request'],
    preparedTree: tree, preparedCommit: commit, pullRequestNumber: 73 });
  expect(f.writes).toEqual(['tree', 'commit', 'branch', 'pull-request']); expect(f.release).toHaveBeenCalledTimes(1);
  expect(f.delivery.mock.calls[0]).toHaveLength(3); expect(f.revalidate).toHaveBeenCalledTimes(4);
  for (const state of f.states) expect(parseSetupPublisherOperation(state)).toEqual(state);
  expect(JSON.stringify(f.states)).not.toContain('name: Publisher'); expect(JSON.stringify(f.states)).not.toContain('session');
});
it.each(['cancelled', 'stale'] as const)('starts no effects or journal writes when %s before admission', async reason => {
  const f = fixture(); if (reason === 'cancelled') f.active.mockReturnValue(false); else f.revalidate.mockResolvedValue(false);
  await expect(f.execute()).rejects.toMatchObject({ reason }); expect(f.states).toEqual([]); expect(f.writes).toEqual([]);
  expect(f.release).toHaveBeenCalledTimes(1);
});
it('rejects post-preview file changes before locking or writing a journal', async () => {
  const f = fixture(), changed = { ...f.plan, files: f.plan.files.map((file, index) => index ? file : { ...file, content: `${file.content}# changed\n` }) };
  await expect(new ApplySetupPublisherUseCase(f.ports).execute(changed, f.session, f.revalidate)).rejects.toMatchObject({ reason: 'operation-mismatch' });
  expect(f.journal.lock).not.toHaveBeenCalled(); expect(f.states).toEqual([]);
});
it('cancellation immediately before the first freshness read starts no read or effect', async () => {
  const f = fixture(); f.active.mockReturnValueOnce(true).mockReturnValue(false);
  await expect(f.execute()).rejects.toMatchObject({ reason: 'cancelled' }); expect(f.revalidate).not.toHaveBeenCalled(); expect(f.states).toEqual([]);
});
it('cancellation while freshness is pending prevents all effects despite unchanged facts', async () => {
  const f = fixture(); f.revalidate.mockImplementation(async () => { f.active.mockReturnValue(false); return true; });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'cancelled' }); expect(f.states).toEqual([]); expect(f.writes).toEqual([]);
});
it('preserves cancellation when the initial freshness read rejects after interruption', async () => {
  const f = fixture(); f.revalidate.mockImplementation(async () => { f.active.mockReturnValue(false); throw new Error('read interrupted'); });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'cancelled' });
  expect(f.states).toEqual([]); expect(f.writes).toEqual([]); expect(f.delivery).not.toHaveBeenCalled();
});
it('does not overwrite an existing operation that was absent from review', async () => {
  const f = fixture(); f.retain(f.empty);
  await expect(f.execute()).rejects.toMatchObject({ reason: 'operation-mismatch' }); expect(f.states).toEqual([]); expect(f.delivery).not.toHaveBeenCalled();
});
it('requires the same reviewed journal snapshot after obtaining its lock', async () => {
  const f = fixture(), reviewed = f.completed(); f.retain({ ...reviewed, uncertain: 'branch' });
  await expect(f.execute(reviewed)).rejects.toMatchObject({ reason: 'operation-mismatch' }); expect(f.writes).toEqual([]); expect(f.states).toEqual([]);
});
it('cannot recreate an operation whose reviewed journal is missing', async () => {
  const f = fixture(); await expect(f.execute(f.completed())).rejects.toMatchObject({ reason: 'operation-mismatch' }); expect(f.states).toEqual([]);
});
it.each(['operationId', 'purpose', 'repositoryId', 'repository', 'defaultBranch', 'baseSha', 'sourceCommit', 'planDigest', 'approvalDigest', 'actorId'])(
  'binds resume to the reviewed %s before locking', async key => {
    const f = fixture(), existing = { ...f.empty, [key]: key.endsWith('Id') && key !== 'operationId' ? 999 : key.endsWith('Digest') ? 'f'.repeat(64)
      : key.endsWith('Sha') || key === 'sourceCommit' ? 'f'.repeat(40) : key === 'operationId' ? '99999999-9999-4999-8999-999999999999' : 'different' };
    await expect(f.execute(existing as SetupPublisherOperation)).rejects.toMatchObject({ reason: 'operation-mismatch' }); expect(f.journal.lock).not.toHaveBeenCalled();
  },
);
it('rejects a cross-purpose or resource-effect resume before any journal mutation', async () => {
  const f = fixture(); await expect(f.execute({ ...f.empty, effects: ['variable'] } as unknown as SetupPublisherOperation)).rejects.toMatchObject({ reason: 'operation-mismatch' });
  expect(f.journal.lock).not.toHaveBeenCalled(); expect(f.states).toEqual([]);
});
it.each(['tree', 'commit'] as const)('never replays an uncertain %s without an identifiable completed object', async uncertain => {
  const f = fixture(), existing: SetupPublisherOperation = uncertain === 'tree' ? { ...f.empty, status: 'partial', uncertain }
    : { ...f.empty, status: 'partial', effects: ['tree'], preparedTree: tree, uncertain };
  f.retain(existing); await expect(f.execute(existing)).rejects.toMatchObject({ reason: 'uncertain-preparation', retained: existing, lastPersisted: existing });
  expect(f.writes).toEqual([]); expect(f.states).toEqual([]); expect(f.delivery).not.toHaveBeenCalled();
});
it('reuses a known exact prepared tree and creates no replacement tree', async () => {
  const f = fixture(), existing: SetupPublisherOperation = { ...f.empty, status: 'partial', effects: ['tree'], preparedTree: tree }; f.retain(existing);
  expect(await f.execute(existing)).toMatchObject({ status: 'waiting-for-merge', preparedTree: tree, preparedCommit: commit });
  expect(f.writer.prepareCommit).toHaveBeenCalledWith(expect.any(Function), tree); expect(f.writes).toEqual(['commit', 'branch', 'pull-request']);
});
it('reuses a known exact prepared commit through the shared coordinator', async () => {
  const f = fixture(), existing = f.completed(); f.retain(existing); await f.execute(existing);
  expect(f.writer.prepareCommit).not.toHaveBeenCalled(); expect(f.writes).toEqual(['branch', 'pull-request']);
});
it.each(['branch', 'pull-request'] as const)('enables freshly reviewed create-if-absent recovery for an uncertain %s', async uncertain => {
  const f = fixture(), existing = { ...f.completed(uncertain === 'branch' ? ['tree', 'commit'] : ['tree', 'commit', 'branch']), uncertain }; f.retain(existing);
  await f.execute(existing); expect(f.writer.prepareCommit).not.toHaveBeenCalled();
  expect(f.writer[uncertain === 'branch' ? 'branch' : 'pullRequest']).toHaveBeenCalledWith(commit, false);
  expect(f.reads).toEqual([]); expect(f.writes).toEqual(uncertain === 'branch' ? ['branch', 'pull-request'] : ['pull-request']);
});
it('a completed journal revalidates the exact ref and PR with no new writes or journal rewrite', async () => {
  const f = fixture(), existing = f.completed(['tree', 'commit', 'branch', 'pull-request']); f.retain(existing);
  expect(await f.execute(existing)).toEqual(existing); expect(f.reads).toEqual(['branch', 'pull-request']); expect(f.writes).toEqual([]); expect(f.states).toEqual([]);
});
it('a different PR number cannot be adopted from an old completed receipt', async () => {
  const f = fixture(), existing = f.completed(['tree', 'commit', 'branch', 'pull-request']); f.retain(existing); f.writer.pullRequest.mockResolvedValue(99);
  await expect(f.execute(existing)).rejects.toMatchObject({ reason: 'operation-mismatch', lastPersisted: existing }); expect(f.writes).toEqual([]); expect(f.states).toEqual([]);
});
it('an unavailable completed ref remains unverified without a replacement POST', async () => {
  const f = fixture(), existing = f.completed(['tree', 'commit', 'branch', 'pull-request']); f.retain(existing); f.writer.branch.mockRejectedValue(new Error('private-provider-value'));
  await expect(f.execute(existing)).rejects.toMatchObject({ reason: 'delivery', lastPersisted: existing }); expect(f.writer.pullRequest).not.toHaveBeenCalled(); expect(f.states).toEqual([]);
});
it('finalizes a retained PR-complete applying operation after exact read-only verification', async () => {
  const f = fixture(), existing = parseSetupPublisherOperation({ ...f.completed(['tree', 'commit', 'branch', 'pull-request']), status: 'applying' });
  f.retain(existing);
  let branchStarted!: () => void, releaseBranch!: () => void, pullStarted!: () => void, releasePull!: () => void;
  const branchStart = new Promise<void>(resolve => { branchStarted = resolve; });
  const branchProof = new Promise<void>(resolve => { releaseBranch = resolve; });
  const pullStart = new Promise<void>(resolve => { pullStarted = resolve; });
  const pullProof = new Promise<void>(resolve => { releasePull = resolve; });
  const trace: string[] = [], save = f.journal.save.getMockImplementation()!;
  f.writer.branch.mockImplementation(async () => { branchStarted(); await branchProof; f.reads.push('branch'); trace.push('branch verified'); });
  f.writer.pullRequest.mockImplementation(async () => { pullStarted(); await pullProof; f.reads.push('pull-request'); trace.push('PR verified'); return 73; });
  f.journal.save.mockImplementation(async value => { trace.push(`save ${value.status}`); await save(value); });
  const pending = f.execute(existing);
  await branchStart;
  expect(f.writer.branch).toHaveBeenCalledWith(existing.preparedCommit, true);
  expect(f.writer.pullRequest).not.toHaveBeenCalled(); expect(f.journal.save).not.toHaveBeenCalled();
  expect(f.saved()).toEqual(existing);
  releaseBranch(); await pullStart;
  expect(f.writer.pullRequest).toHaveBeenCalledWith(existing.preparedCommit, true);
  expect(f.journal.save).not.toHaveBeenCalled(); expect(f.saved()).toEqual(existing);
  releasePull(); const result = await pending;
  expect(trace).toEqual(['branch verified', 'PR verified', 'save waiting-for-merge']);
  expect(result).toEqual({ ...existing, status: 'waiting-for-merge' });
  expect(f.saved()).toEqual(result); expect(f.states).toEqual([result]);
  expect(f.reads).toEqual(['branch', 'pull-request']); expect(f.writes).toEqual([]);
  expect(f.writer.prepareCommit).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(1);
});
it('reports failed terminal reconciliation without overstating the last durable PR-complete state', async () => {
  const f = fixture(), existing = parseSetupPublisherOperation({ ...f.completed(['tree', 'commit', 'branch', 'pull-request']), status: 'applying' });
  f.retain(existing); f.journal.save.mockRejectedValue(new Error('private-terminal-save'));
  await expect(f.execute(existing)).rejects.toMatchObject({ reason: 'journal',
    retained: { ...existing, status: 'waiting-for-merge' }, lastPersisted: existing });
  expect(f.saved()).toEqual(existing); expect(f.reads).toEqual(['branch', 'pull-request']); expect(f.writes).toEqual([]);
  expect(f.writer.prepareCommit).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(1);
});
it('cancellation after a known commit preserves it and prevents branch creation', async () => {
  const f = fixture(), prepare = f.writer.prepareCommit.getMockImplementation()!;
  f.writer.prepareCommit.mockImplementation(async (...args) => { const result = await prepare(...args); f.active.mockReturnValue(false); return result; });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'cancelled', retained: { status: 'partial', preparedCommit: commit, effects: ['tree', 'commit'] } });
  expect(f.writes).toEqual(['tree', 'commit']); expect(f.saved()?.uncertain).toBeUndefined();
});
it('a fresh mismatch before preparation saves a blocked operation without Git writes', async () => {
  const f = fixture(); f.revalidate.mockResolvedValueOnce(true).mockResolvedValue(false);
  await expect(f.execute()).rejects.toMatchObject({ reason: 'stale', retained: { status: 'blocked', effects: [] } }); expect(f.writes).toEqual([]);
});
it('cancellation before shared preparation retains cancellation without a fabricated object intent', async () => {
  const f = fixture(), save = f.journal.save.getMockImplementation()!;
  f.journal.save.mockImplementation(async value => { await save(value); f.active.mockReturnValue(false); });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'cancelled', retained: { status: 'cancelled', effects: [] } }); expect(f.writes).toEqual([]);
});
it.each(['tree', 'commit', 'branch', 'pull-request'] as const)('retains an unknown %s outcome and stops every later effect', async phase => {
  const f = fixture();
  if (phase === 'tree' || phase === 'commit') f.writer.prepareCommit.mockImplementation(async observe => {
    await observe({ effect: 'tree', state: 'starting' }); f.writes.push('tree');
    if (phase === 'commit') { await observe({ effect: 'tree', state: 'completed', sha: tree }); await observe({ effect: 'commit', state: 'starting' }); f.writes.push('commit'); }
    throw new Error('private-response-value');
  });
  else if (phase === 'branch') f.writer.branch.mockRejectedValue(new Error('private-response-value'));
  else f.writer.pullRequest.mockRejectedValue(new Error('private-response-value'));
  await expect(f.execute()).rejects.toMatchObject({ reason: 'delivery', retained: { status: 'partial', uncertain: phase } });
  expect(f.saved()?.uncertain).toBe(phase); expect(f.saved()?.effects).not.toContain(phase);
  if (phase !== 'pull-request') expect(f.writer.pullRequest).not.toHaveBeenCalled();
});
it.each(['initial', 'intent', 'tree-confirmed', 'branch-confirmed', 'final'] as const)('does not overstate durability after a %s journal failure', async point => {
  const f = fixture(), save = f.journal.save.getMockImplementation()!;
  f.journal.save.mockImplementation(async value => {
    if (point === 'initial' || point === 'intent' && value.uncertain === 'tree'
      || point === 'tree-confirmed' && value.effects.includes('tree')
      || point === 'branch-confirmed' && value.effects.includes('branch')
      || point === 'final' && value.status === 'waiting-for-merge') throw new Error('private-journal-value');
    return save(value);
  });
  let error: SetupPublisherApplyError | undefined; try { await f.execute(); } catch (cause) { error = cause as SetupPublisherApplyError; }
  expect(error?.reason).toBe('journal'); expect(error?.lastPersisted).toEqual(f.saved());
  expect(error?.message).not.toContain('private-'); expect(f.release).toHaveBeenCalledTimes(1);
  if (point === 'initial' || point === 'intent') expect(f.writes).toEqual([]);
  if (point === 'tree-confirmed') { expect(error?.retained.preparedTree).toBe(tree); expect(f.writes).toEqual(['tree']); }
  if (point === 'branch-confirmed') expect(f.writer.pullRequest).not.toHaveBeenCalled();
});
it('a failed exclusive lock or read creates no provider effects', async () => {
  const f = fixture(); f.journal.lock.mockRejectedValue(new Error('private-lock'));
  await expect(f.execute()).rejects.toMatchObject({ reason: 'journal' }); expect(f.journal.load).not.toHaveBeenCalled();
  f.journal.lock.mockReset().mockResolvedValue(f.release); f.journal.load.mockRejectedValue(new Error('private-read'));
  await expect(f.execute()).rejects.toMatchObject({ reason: 'journal' }); expect(f.writes).toEqual([]); expect(f.release).toHaveBeenCalledTimes(1);
});
it('a failed lock release reports the known completed PR and actual last durable state', async () => {
  const f = fixture(); f.release.mockRejectedValue(new Error('private-release'));
  await expect(f.execute()).rejects.toMatchObject({ reason: 'journal', retained: { status: 'waiting-for-merge', pullRequestNumber: 73 }, lastPersisted: { pullRequestNumber: 73 } });
});
it('a failed private-session delivery binding cannot start a Git effect or persist a false success', async () => {
  const f = fixture(); f.delivery.mockImplementation(() => { throw new Error('private-session-value'); });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'delivery' }); expect(f.states).toEqual([]); expect(f.writes).toEqual([]);
});
it.each(['malformed-return', 'missing-observer', 'wrong-order', 'missing-commit-intent'] as const)('refuses %s from preparation before creating a branch', async kind => {
  const f = fixture(); f.writer.prepareCommit.mockImplementation(async observe => {
    if (kind === 'wrong-order') await observe({ effect: 'commit', state: 'starting' });
    if (kind === 'missing-commit-intent') { await observe({ effect: 'tree', state: 'completed', sha: tree }); await observe({ effect: 'commit', state: 'completed', sha: commit }); }
    return kind === 'malformed-return' ? 'unbound-ref' : commit;
  });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'delivery' }); expect(f.writer.branch).not.toHaveBeenCalled();
});
it('refuses an invalid PR result while retaining its exact commit and branch', async () => {
  const f = fixture(); f.writer.pullRequest.mockResolvedValue(0);
  await expect(f.execute()).rejects.toMatchObject({ reason: 'delivery', retained: { uncertain: 'pull-request', effects: ['tree', 'commit', 'branch'] } });
});
it('serializes concurrent Applies through the actual shared UUID lock contract', async () => {
  const f = fixture(), prepare = f.writer.prepareCommit.getMockImplementation()!;
  let begin!: () => void, finish!: () => void;
  const started = new Promise<void>(resolve => { begin = resolve; }), pending = new Promise<void>(resolve => { finish = resolve; });
  f.writer.prepareCommit.mockImplementation(async (...args) => { begin(); await pending; return prepare(...args); });
  const first = f.execute(); await started;
  await expect(f.execute()).rejects.toMatchObject({ reason: 'journal' }); finish(); await first;
  expect(f.writer.prepareCommit).toHaveBeenCalledTimes(1); expect(f.writes).toEqual(['tree', 'commit', 'branch', 'pull-request']);
});
it('fresh review decline never reaches this journal, lock or delivery composition', async () => {
  const f = fixture();
  const review = new ReviewSetupPublisherUseCase({ inspect: async () => ({ inspection: f.inspection, session: f.session }),
    present: async () => undefined, confirm: async () => 'decline', active: f.active });
  expect(await review.execute({ proposal: f.proposal, operationId: id, dryRun: false }, (plan, session, fresh) =>
    new ApplySetupPublisherUseCase(f.ports).execute(plan, session, fresh))).toMatchObject({ stage: 'declined' });
  expect(f.journal.lock).not.toHaveBeenCalled(); expect(f.states).toEqual([]); expect(f.writes).toEqual([]);
});
it('fresh review approval binds its same private session to actual common delivery and the final PR receipt', async () => {
  const f = fixture();
  const review = new ReviewSetupPublisherUseCase({ inspect: async () => ({ inspection: f.inspection, session: f.session }),
    present: async () => undefined, confirm: async () => 'approve', active: f.active });
  expect(await review.execute({ proposal: f.proposal, operationId: id, dryRun: false }, (plan, session, fresh) =>
    new ApplySetupPublisherUseCase(f.ports).execute(plan, session, fresh))).toMatchObject({ stage: 'apply', result: { status: 'waiting-for-merge', pullRequestNumber: 73 } });
  expect(f.delivery.mock.calls[0][1]).toBe(f.session); expect(f.saved()?.effects).toEqual(['tree', 'commit', 'branch', 'pull-request']);
});
it('preserves a known tree on an explicit stop before commit starts, allowing exact-tree recovery', async () => {
  const f = fixture(); f.writer.prepareCommit.mockImplementation(async observe => {
    await observe({ effect: 'tree', state: 'starting' }); f.writes.push('tree'); await observe({ effect: 'tree', state: 'completed', sha: tree });
    throw new SetupInstallationSnapshotChanged();
  });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'stale', retained: { status: 'partial', preparedTree: tree, effects: ['tree'] } });
  expect(f.saved()?.uncertain).toBeUndefined(); expect(f.writer.branch).not.toHaveBeenCalled();
});

it.each(['branch', 'pullRequest'] as const)('completed recovery reports %s snapshot drift as stale without changing its durable receipt', async phase => {
  const f = fixture(), existing = f.completed(['tree', 'commit', 'branch', 'pull-request']); f.retain(existing);
  f.writer[phase].mockRejectedValue(new SetupInstallationSnapshotChanged());
  await expect(f.execute(existing)).rejects.toMatchObject({ reason: 'stale', retained: existing, lastPersisted: existing });
  expect(f.states).toEqual([]); expect(f.writes).toEqual([]); expect(f.release).toHaveBeenCalledTimes(1);
  if (phase === 'branch') expect(f.writer.pullRequest).not.toHaveBeenCalled();
});
it.each(['branch', 'pullRequest'] as const)('completed recovery preserves cancellation during %s snapshot drift', async phase => {
  const f = fixture(), existing = f.completed(['tree', 'commit', 'branch', 'pull-request']); f.retain(existing);
  f.writer[phase].mockImplementation(async () => { f.active.mockReturnValue(false); throw new SetupInstallationSnapshotChanged(); });
  await expect(f.execute(existing)).rejects.toMatchObject({ reason: 'cancelled', retained: existing, lastPersisted: existing });
  expect(f.states).toEqual([]); expect(f.writes).toEqual([]); expect(f.release).toHaveBeenCalledTimes(1);
});
