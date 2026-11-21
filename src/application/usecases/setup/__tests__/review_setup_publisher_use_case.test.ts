import { ReviewSetupPublisherUseCase, SetupPublisherReviewError } from '../review_setup_publisher_use_case';
import { setupPublisherFixture } from '../../../policies/__tests__/fixtures/setup_publisher_fixture';
import type { SetupPublisherReadSnapshot, SetupPublisherReviewPorts } from '../../../ports/setup_publisher_review_ports';
import type { SetupPublisherPlan } from '../../../../domain/setup_publisher_installation';
import { SETUP_PUBLISHER_WORKFLOW_PATH } from '../../../../domain/setup_publisher_installation';

const id = '12345678-1234-4234-8234-123456789abc';
function fixture() {
  const data = setupPublisherFixture(), session = {}, order: string[] = [];
  const snapshot = () => ({ inspection: data.inspection, session });
  const ports = {
    inspect: jest.fn<ReturnType<SetupPublisherReviewPorts['inspect']>, Parameters<SetupPublisherReviewPorts['inspect']>>(
      async () => { order.push('inspect'); return snapshot(); }),
    present: jest.fn(async (_plan: SetupPublisherPlan) => { order.push('present'); }),
    confirm: jest.fn<ReturnType<SetupPublisherReviewPorts['confirm']>, Parameters<SetupPublisherReviewPorts['confirm']>>(async () => {
      order.push('confirm'); return 'approve';
    }),
    active: jest.fn(() => true),
  };
  const apply = jest.fn(async (_plan: SetupPublisherPlan, _session: object, _revalidate: () => Promise<boolean>) => {
    order.push('apply'); return 73;
  });
  const input = { proposal: data.proposal, operationId: id, dryRun: false };
  const execute = () => new ReviewSetupPublisherUseCase(ports).execute(input, apply);
  return { ...data, session, snapshot, ports, apply, input, execute, order };
}

it('requires presentation, explicit approval and fresh identical facts before invoking the approved action', async () => {
  const f = fixture(), result = await f.execute();
  expect(result).toMatchObject({ stage: 'apply', result: 73, plan: { status: 'review', nativeVerification: 'pending' } });
  expect(f.order).toEqual(['inspect', 'present', 'confirm', 'inspect', 'apply']);
  expect(f.apply.mock.calls[0][0]).toBe(f.ports.present.mock.calls[0][0]);
  expect(f.apply.mock.calls[0][1]).toBe(f.session);
  expect(Object.keys(result.plan)).not.toContain('session'); expect(Object.keys(result.plan)).not.toContain('approved');
});
it('cancellation at the final approval admission boundary cannot open confirmation or Apply', async () => {
  const f = fixture(); let checks = 0;
  f.ports.active.mockImplementation(() => ++checks < 4);
  expect(await f.execute()).toMatchObject({ stage: 'cancelled' });
  expect(f.ports.present).toHaveBeenCalledTimes(1); expect(f.ports.confirm).not.toHaveBeenCalled();
  expect(f.apply).not.toHaveBeenCalled(); expect(f.order).toEqual(['inspect', 'present']);
});
it('a dry-run cannot call confirmation or the approved action, even if input changes during presentation', async () => {
  const f = fixture(); f.input.dryRun = true;
  f.ports.present.mockImplementation(async () => { f.input.dryRun = false; f.input.operationId = 'different'; });
  expect(await f.execute()).toMatchObject({ stage: 'dry-run', plan: { operationId: id } });
  expect(f.ports.inspect).toHaveBeenCalledTimes(1); expect(f.ports.confirm).not.toHaveBeenCalled(); expect(f.apply).not.toHaveBeenCalled();
});
it('an exact existing workflow remains unchanged with native evidence pending and no approval or action', async () => {
  const f = fixture(); f.inspection.installation.publisher = { kind: 'exact', paths: [SETUP_PUBLISHER_WORKFLOW_PATH] };
  f.inspection.installation.workflows.push({ path: SETUP_PUBLISHER_WORKFLOW_PATH, mode: '100644',
    content: f.inspection.source.workflow.replace('uses: ./', `uses: vypdev/copilot@${f.inspection.source.commit}`) });
  expect(await f.execute()).toMatchObject({ stage: 'unchanged', plan: { nativeVerification: 'pending', files: [] } });
  expect(f.ports.confirm).not.toHaveBeenCalled(); expect(f.apply).not.toHaveBeenCalled();
});
it.each(['decline', 'cancel'] as const)('a fresh %s response cannot enter Apply', async answer => {
  const f = fixture(); f.ports.confirm.mockResolvedValue(answer);
  expect(await f.execute()).toMatchObject({ stage: answer === 'decline' ? 'declined' : 'cancelled' });
  expect(f.ports.inspect).toHaveBeenCalledTimes(1); expect(f.apply).not.toHaveBeenCalled();
});
it.each(['not-a-uuid', '', '../escape'])('rejects invalid operation %j before transport or presentation', async operationId => {
  const f = fixture(); f.input.operationId = operationId;
  await expect(f.execute()).rejects.toMatchObject({ reason: 'invalid' }); expect(f.ports.inspect).not.toHaveBeenCalled();
});
it('a proposal authorized flag cannot become approval or reach transport', async () => {
  const f = fixture(); Object.assign(f.input.proposal, { installationAuthorized: true });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'invalid' }); expect(f.ports.inspect).not.toHaveBeenCalled();
  expect(f.ports.present).not.toHaveBeenCalled(); expect(f.ports.confirm).not.toHaveBeenCalled(); expect(f.apply).not.toHaveBeenCalled();
});
it('cancellation before inspection prevents every external port call', async () => {
  const f = fixture(); f.ports.active.mockReturnValue(false);
  await expect(f.execute()).rejects.toEqual(new SetupPublisherReviewError('cancelled'));
  expect(f.ports.inspect).not.toHaveBeenCalled(); expect(f.ports.present).not.toHaveBeenCalled();
});
it('cancellation while inspection completes cannot present a dry-run or claim completion', async () => {
  const f = fixture(); f.input.dryRun = true;
  f.ports.inspect.mockImplementation(async () => { f.ports.active.mockReturnValue(false); return f.snapshot(); });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'cancelled' });
  expect(f.ports.present).not.toHaveBeenCalled(); expect(f.apply).not.toHaveBeenCalled();
});
it.each(['present', 'confirm'] as const)('cancellation during %s prevents Apply', async point => {
  const f = fixture();
  if (point === 'present') f.ports.present.mockImplementation(async () => { f.ports.active.mockReturnValue(false); });
  else f.ports.confirm.mockImplementation(async () => { f.ports.active.mockReturnValue(false); return 'approve'; });
  expect(await f.execute()).toMatchObject({ stage: 'cancelled' }); expect(f.apply).not.toHaveBeenCalled();
});
it('normalizes a failed authenticated read without echoing provider content', async () => {
  const f = fixture(); f.ports.inspect.mockRejectedValue(new Error('private-provider-value'));
  await expect(f.execute()).rejects.toEqual(new SetupPublisherReviewError('unavailable')); expect(f.ports.present).not.toHaveBeenCalled();
});
it.each([undefined, null, 'private-token', 1, false, () => undefined])('refuses invalid private-session identity %j', async session => {
  const f = fixture(); f.ports.inspect.mockResolvedValue({ inspection: f.inspection, session } as unknown as SetupPublisherReadSnapshot);
  await expect(f.execute()).rejects.toEqual(new SetupPublisherReviewError('unavailable')); expect(f.apply).not.toHaveBeenCalled();
});
it.each(['present', 'confirm'] as const)('normalizes %s errors without invoking the approved action', async point => {
  const f = fixture(); f.ports[point].mockRejectedValue(new Error('private-view-value'));
  await expect(f.execute()).rejects.toEqual(new SetupPublisherReviewError('presentation')); expect(f.apply).not.toHaveBeenCalled();
});
it('requires fresh review after credential rotation even when serialized session identities look equal', async () => {
  const f = fixture(); f.ports.inspect.mockResolvedValueOnce(f.snapshot()).mockResolvedValue({ inspection: f.inspection, session: {} });
  await expect(f.execute()).rejects.toEqual(new SetupPublisherReviewError('stale')); expect(f.apply).not.toHaveBeenCalled();
});
it('does not let a reused adapter envelope replace the privately reviewed credential generation', async () => {
  const f = fixture(), envelope = f.snapshot();
  f.ports.inspect.mockResolvedValue(envelope);
  f.ports.confirm.mockImplementation(async () => { envelope.session = {}; return 'approve'; });
  await expect(f.execute()).rejects.toEqual(new SetupPublisherReviewError('stale')); expect(f.apply).not.toHaveBeenCalled();
});
it.each(['actor', 'authority', 'default', 'source', 'manifest', 'inventory', 'unchanged'])(
  'blocks %s drift after human approval', async kind => {
    const f = fixture(); f.ports.confirm.mockImplementation(async () => {
      if (kind === 'actor') f.inspection.authority.actorId += 1;
      if (kind === 'authority') f.inspection.authority.workflows = 'unknown';
      if (kind === 'default') f.inspection.target.defaultBranch = 'new-default';
      if (kind === 'source') f.inspection.source.workflow += '# changed\n';
      if (kind === 'manifest') { Object.assign(f.manifest, { retained: 'new value' }); f.syncManifest(); }
      if (kind === 'inventory') f.inspection.installation.complete = false;
      if (kind === 'unchanged') {
        f.inspection.installation.publisher = { kind: 'exact', paths: [SETUP_PUBLISHER_WORKFLOW_PATH] };
        f.inspection.installation.workflows.push({ path: SETUP_PUBLISHER_WORKFLOW_PATH, mode: '100644',
          content: f.inspection.source.workflow.replace('uses: ./', `uses: vypdev/copilot@${f.inspection.source.commit}`) });
      }
      return 'approve';
    });
    await expect(f.execute()).rejects.toEqual(new SetupPublisherReviewError('stale')); expect(f.apply).not.toHaveBeenCalled();
  },
);
it.each(['resolved', 'rejected'] as const)('preserves cancellation while a post-approval read is %s', async outcome => {
  const f = fixture(); f.ports.inspect.mockResolvedValueOnce(f.snapshot()).mockImplementation(async () => {
    f.ports.active.mockReturnValue(false);
    if (outcome === 'rejected') throw new Error('read interrupted');
    return f.snapshot();
  });
  await expect(f.execute()).rejects.toEqual(new SetupPublisherReviewError('cancelled')); expect(f.apply).not.toHaveBeenCalled();
});
it('revalidates during Apply and expires that private callback as soon as the action finishes', async () => {
  const f = fixture(); let retained: (() => Promise<boolean>) | undefined;
  f.apply.mockImplementation(async (_plan, _session, fresh) => { retained = fresh; expect(await fresh()).toBe(true); return 73; });
  await f.execute(); expect(f.ports.inspect).toHaveBeenCalledTimes(3);
  expect(await retained!()).toBe(false); expect(f.ports.inspect).toHaveBeenCalledTimes(3);
});
it('permanently revokes this approval after cancellation during Apply', async () => {
  const f = fixture(); f.apply.mockImplementation(async (_plan, _session, fresh) => {
    f.ports.active.mockReturnValue(false); expect(await fresh()).toBe(false);
    f.ports.active.mockReturnValue(true); expect(await fresh()).toBe(false); return 73;
  });
  await f.execute(); expect(f.ports.inspect).toHaveBeenCalledTimes(2);
});
it('requires fresh human review after a denied read even if the provider later recovers', async () => {
  const f = fixture(); f.apply.mockImplementation(async (_plan, _session, fresh) => {
    f.ports.inspect.mockRejectedValue(new Error('private-value')); expect(await fresh()).toBe(false);
    f.ports.inspect.mockResolvedValue(f.snapshot()); expect(await fresh()).toBe(false); return 73;
  });
  await f.execute(); expect(f.ports.inspect).toHaveBeenCalledTimes(3);
});
it('expires the callback after an action failure while preserving the delivery recovery error', async () => {
  const f = fixture(), failure = new Error('Retained operation requires inspection.'); let retained: (() => Promise<boolean>) | undefined;
  f.apply.mockImplementation(async (_plan, _session, fresh) => { retained = fresh; throw failure; });
  await expect(f.execute()).rejects.toBe(failure); expect(await retained!()).toBe(false);
});
it('does not let a freshness read that finishes after Apply ends revive the approval', async () => {
  const f = fixture(); let finish: ((snapshot: SetupPublisherReadSnapshot) => void) | undefined, pending: Promise<boolean> | undefined;
  f.apply.mockImplementation(async (_plan, _session, fresh) => {
    f.ports.inspect.mockImplementation(() => new Promise(resolve => { finish = resolve; })); pending = fresh(); return 73;
  });
  await f.execute(); finish!(f.snapshot()); expect(await pending).toBe(false);
});
