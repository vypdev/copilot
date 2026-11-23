import { DeliverSetupInstallationUseCase } from '../deliver_setup_installation_use_case';
import { setupPublisherFixture } from '../../../policies/__tests__/fixtures/setup_publisher_fixture';
import { planSetupPublisherInstallation } from '../../../policies/setup_publisher_plan_policy';
import { parseSetupPublisherOperation, setupPublisherOperationMatchesPlan } from '../../../policies/setup_publisher_installation_policy';
import type { SetupPublisherOperation, SetupPublisherPlan } from '../../../../domain/setup_publisher_installation';
import { InstallSetupPublisherUseCase } from '../install_setup_publisher_use_case';
import { ReviewSetupPublisherUseCase } from '../review_setup_publisher_use_case';
import { ApplySetupPublisherUseCase } from '../apply_setup_publisher_use_case';

const id = '11111111-1111-4111-8111-111111111111';
function operation(plan: SetupPublisherPlan): SetupPublisherOperation {
  return parseSetupPublisherOperation({ schemaVersion: 2, purpose: plan.purpose, operationId: plan.operationId,
    repositoryId: plan.target.id, repository: `${plan.target.owner}/${plan.target.name}`, defaultBranch: plan.target.defaultBranch,
    baseSha: plan.target.baseSha, sourceCommit: plan.sourceCommit, planDigest: plan.digest, approvalDigest: plan.approvalDigest,
    actorId: plan.actorId, status: 'partial', effects: [], uncertain: 'tree' });
}
function fixture() {
  const f = setupPublisherFixture(), plan = planSetupPublisherInstallation(f.proposal, f.inspection, id), retained = operation(plan);
  const events: string[] = [], load = jest.fn(async (_operationId: string): Promise<SetupPublisherOperation | undefined> => undefined);
  const inspect = jest.fn(async () => { events.push('inspect'); return { inspection: f.inspection, session: {} }; });
  const session = {}; inspect.mockImplementation(async () => { events.push('inspect'); return { inspection: f.inspection, session }; });
  const present = jest.fn(async (_plan: SetupPublisherPlan, _retained?: SetupPublisherOperation) => { events.push('present'); });
  const confirm = jest.fn(async (): Promise<'approve' | 'decline' | 'cancel'> => 'decline');
  const journal = { load, save: jest.fn(), lock: jest.fn() }, delivery = jest.fn();
  const apply = new ApplySetupPublisherUseCase({ coordinator: new DeliverSetupInstallationUseCase(), journal, delivery, active: () => true });
  const applyCall = jest.spyOn(apply, 'execute').mockResolvedValue(retained);
  const review = new ReviewSetupPublisherUseCase({ inspect, present, confirm, active: () => true });
  const useCase = new InstallSetupPublisherUseCase(review, apply, { load: async value => { events.push('load'); return load(value); } });
  const execute = (resume = false, dryRun = true) => useCase.execute({ proposal: f.proposal, operationId: id, resume, dryRun });
  return { ...f, plan, retained, events, load, inspect, present, confirm, journal, delivery, applyCall, useCase, execute };
}
it('loads the purpose-bound journal read-only before inspection and a fresh dry-run preview', async () => {
  const f = fixture(); expect(await f.execute()).toMatchObject({ stage: 'dry-run' });
  expect(f.events).toEqual(['load', 'inspect', 'present']); expect(f.applyCall).not.toHaveBeenCalled();
  expect(f.journal.save).not.toHaveBeenCalled(); expect(f.journal.lock).not.toHaveBeenCalled(); expect(f.delivery).not.toHaveBeenCalled();
});
it('discloses exact known and uncertain retained effects in the immutable snapshot before requesting approval', async () => {
  const f = fixture(); f.load.mockResolvedValue(f.retained);
  expect(await f.execute(true)).toMatchObject({ stage: 'dry-run' });
  expect(f.present).toHaveBeenCalledWith(f.plan, f.retained);
  const displayed = f.present.mock.calls[0][1]!;
  expect(Object.isFrozen(displayed)).toBe(true); expect(Object.isFrozen(displayed.effects)).toBe(true); expect(displayed).not.toBe(f.retained);
  expect(displayed.uncertain).toBe('tree'); expect(f.confirm).not.toHaveBeenCalled(); expect(f.applyCall).not.toHaveBeenCalled();
});
it('requires explicit resume for an existing operation and never treats it as approval', async () => {
  const f = fixture(); f.load.mockResolvedValue(f.retained);
  await expect(f.execute()).rejects.toMatchObject({ reason: 'resume-required' }); expect(f.inspect).not.toHaveBeenCalled(); expect(f.applyCall).not.toHaveBeenCalled();
});
it('does not invent a missing resume record', async () => {
  const f = fixture(); await expect(f.execute(true)).rejects.toMatchObject({ reason: 'resume-missing' }); expect(f.inspect).not.toHaveBeenCalled();
});
it.each([{ operationId: 'bad' }, { dryRun: undefined }, { resume: 'yes' }, { proposal: {} }])('rejects invalid invocation before journal or provider reads', async change => {
  const f = fixture(); await expect(f.useCase.execute({ proposal: f.proposal, operationId: id, dryRun: true, resume: false, ...change } as Parameters<InstallSetupPublisherUseCase['execute']>[0])).rejects.toMatchObject({ reason: 'invalid' });
  expect(f.load).not.toHaveBeenCalled(); expect(f.inspect).not.toHaveBeenCalled();
});
it.each([{ schemaVersion: 1 }, { schemaVersion: 3 }, { purpose: 'another-purpose' }, { extra: true }])('rejects legacy, cross-purpose and malformed retained records before preview', async change => {
  const f = fixture(); f.load.mockResolvedValue({ ...f.retained, ...change } as SetupPublisherOperation);
  await expect(f.execute(true)).rejects.toMatchObject({ reason: 'journal' }); expect(f.inspect).not.toHaveBeenCalled();
});
it('normalizes journal read failure without exposing private diagnostic content', async () => {
  const f = fixture(); f.load.mockRejectedValue(new Error('private provider/credential text'));
  await expect(f.execute(true)).rejects.toThrow('Publisher installation stopped: journal.'); expect(f.inspect).not.toHaveBeenCalled();
});
it('refuses a stale retained identity before displaying a misleading current preview', async () => {
  const f = fixture(); f.load.mockResolvedValue({ ...f.retained, actorId: 999 });
  await expect(f.execute(true)).rejects.toMatchObject({ reason: 'stale' }); expect(f.present).not.toHaveBeenCalled(); expect(f.applyCall).not.toHaveBeenCalled();
});
it('only invokes Apply after fresh explicit confirmation and passes the independently frozen journal snapshot', async () => {
  const f = fixture(); f.load.mockResolvedValue(f.retained); f.confirm.mockResolvedValue('approve');
  expect(await f.execute(true, false)).toMatchObject({ stage: 'apply', result: f.retained });
  const [plan, session, fresh, reviewed] = f.applyCall.mock.calls[0];
  expect(plan).toEqual(f.plan); expect(session).toEqual({}); expect(fresh).toEqual(expect.any(Function));
  expect(reviewed).toEqual(f.retained); expect(reviewed).not.toBe(f.retained); expect(Object.isFrozen(reviewed)).toBe(true);
  expect(f.inspect).toHaveBeenCalledTimes(2); expect(await fresh()).toBe(false);
});
it('captures explicit flags and clones the proposal before asynchronous local journal reads', async () => {
  const f = fixture(), input = { proposal: f.proposal, operationId: id, dryRun: true, resume: false };
  f.load.mockImplementation(async () => { input.dryRun = false; input.resume = true; f.proposal.destination.head = 'f'.repeat(40); return undefined; });
  expect(await f.useCase.execute(input)).toMatchObject({ stage: 'dry-run' }); expect(f.applyCall).not.toHaveBeenCalled();
});
it.each(['operationId', 'purpose', 'repositoryId', 'repository', 'defaultBranch', 'baseSha', 'sourceCommit', 'planDigest', 'approvalDigest', 'actorId'] as const)(
  'binds retained %s to the complete reviewed identity', field => {
    const f = fixture(); expect(setupPublisherOperationMatchesPlan(f.retained, f.plan)).toBe(true);
    const changed = { ...f.retained, [field]: typeof f.retained[field] === 'number' ? 999 : 'different' } as SetupPublisherOperation;
    expect(setupPublisherOperationMatchesPlan(changed, f.plan)).toBe(false);
  });
it('validates an explicitly supplied retained review shape before any source inspection', async () => {
  const f = fixture(); const review = new ReviewSetupPublisherUseCase({ inspect: f.inspect, present: f.present, confirm: f.confirm, active: () => true });
  await expect(review.execute({ proposal: f.proposal, operationId: id, dryRun: true, reviewedOperation: { ...f.retained, schemaVersion: 9 } as unknown as SetupPublisherOperation }, async () => undefined)).rejects.toMatchObject({ reason: 'invalid' });
  expect(f.inspect).not.toHaveBeenCalled();
});
