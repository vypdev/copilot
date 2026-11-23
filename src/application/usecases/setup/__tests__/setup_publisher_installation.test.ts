import { DeliverSetupInstallationUseCase, SetupInstallationDeliveryError } from '../deliver_setup_installation_use_case';
import type { SetupInstallationDeliveryState } from '../../../contracts/setup_installation_delivery';
import { SetupInstallationSnapshotChanged } from '../../../ports/setup_installation_delivery_ports';
import type { SetupInstallationObjectObserver } from '../../../ports/setup_installation_delivery_ports';

const commit = 'c'.repeat(40);
const initial = (): SetupInstallationDeliveryState => ({ effects: [] });
function fixture() {
  const states: SetupInstallationDeliveryState[] = [], order: string[] = [];
  const commands = {
    prepareCommit: jest.fn<Promise<string>, [SetupInstallationObjectObserver?]>(async () => { order.push('prepare'); return commit; }),
    branch: jest.fn(async (_commit: string, _inspectOnly: boolean) => { order.push('branch'); }),
    pullRequest: jest.fn(async (_commit: string, _inspectOnly: boolean) => { order.push('pull-request'); return 42; }),
  };
  const control = { active: jest.fn(() => true), revalidate: jest.fn(async () => true),
    retain: jest.fn(async (state: SetupInstallationDeliveryState) => { states.push(JSON.parse(JSON.stringify(state))); }) };
  const useCase = new DeliverSetupInstallationUseCase();
  const execute = (state = initial()) => useCase.execute(commands, control, state);
  return { commands, control, states, order, execute };
}

describe('shared approved-file delivery and retained effects', () => {
  it('publisher977-C96: cancellation while retaining preparation intent permits a fresh reviewed no-write resume', async () => {
    const f = fixture(), retain = f.control.retain.getMockImplementation()!;
    f.control.retain.mockImplementation(async state => {
      await retain(state);
      if (state.uncertain === 'prepared-objects') f.control.active.mockReturnValue(false);
    });
    await expect(f.execute()).rejects.toMatchObject({ reason: 'cancelled', retained: { effects: [], uncertain: undefined } });
    expect(f.commands.prepareCommit).not.toHaveBeenCalled();
    expect(f.states).toEqual([{ effects: [], uncertain: 'prepared-objects' }, { effects: [], uncertain: undefined }]);
    f.control.retain.mockImplementation(retain); f.control.active.mockReturnValue(true);
    expect(await f.execute(f.states.at(-1)!)).toMatchObject({ preparedCommit: commit, effects: ['branch', 'pull-request'] });
    expect(f.commands.prepareCommit).toHaveBeenCalledTimes(1);
  });
  it('publisher977-C96: a failed durable no-write proof preserves preparation uncertainty', async () => {
    const f = fixture(), retain = f.control.retain.getMockImplementation()!;
    f.control.retain.mockImplementation(async state => {
      if (state.uncertain === undefined) throw new Error('proof save failed');
      await retain(state); f.control.active.mockReturnValue(false);
    });
    await expect(f.execute()).rejects.toMatchObject({ reason: 'provider', retained: { effects: [], uncertain: 'prepared-objects' } });
    expect(f.states).toEqual([{ effects: [], uncertain: 'prepared-objects' }]);
    expect(f.commands.prepareCommit).not.toHaveBeenCalled();
    f.control.active.mockReturnValue(true);
    await expect(f.execute(f.states[0])).rejects.toMatchObject({ reason: 'uncertain-preparation' });
    expect(f.commands.prepareCommit).not.toHaveBeenCalled();
  });
  it('clears preparation uncertainty only after an observed stop before the tree POST', async () => {
    const f = fixture();
    f.commands.prepareCommit.mockImplementation(async observe => {
      await observe?.({ effect: 'tree', state: 'not-started' }); throw new Error('base read unavailable');
    });
    await expect(f.execute()).rejects.toMatchObject({ reason: 'provider', retained: { uncertain: undefined } });
    expect(f.states.at(-1)).toEqual({ effects: [], uncertain: undefined });
    expect(f.commands.branch).not.toHaveBeenCalled();
  });
  it('does not clear unknown preparation when a tree exists but commit creation never started', async () => {
    const f = fixture();
    f.commands.prepareCommit.mockImplementation(async observe => {
      await observe?.({ effect: 'tree', state: 'completed', sha: 'd'.repeat(40) });
      await observe?.({ effect: 'commit', state: 'not-started' }); throw new Error('tree proof unavailable');
    });
    await expect(f.execute()).rejects.toMatchObject({ reason: 'provider', retained: { uncertain: 'prepared-objects' } });
    expect(f.states).toEqual([{ effects: [], uncertain: 'prepared-objects' }]);
  });
  it('retains the observed commit identity even if its subsequent proof read fails', async () => {
    const f = fixture();
    f.commands.prepareCommit.mockImplementation(async observe => {
      await observe?.({ effect: 'commit', state: 'completed', sha: commit }); throw new Error('commit proof unavailable');
    });
    await expect(f.execute()).rejects.toMatchObject({ reason: 'provider', retained: { preparedCommit: commit, uncertain: undefined } });
    expect(f.commands.branch).not.toHaveBeenCalled();
  });
  it('rejects an invalid observed commit identity without clearing preparation uncertainty', async () => {
    const f = fixture();
    f.commands.prepareCommit.mockImplementation(async observe => {
      await observe?.({ effect: 'commit', state: 'completed', sha: 'HEAD' }); return commit;
    });
    await expect(f.execute()).rejects.toMatchObject({ reason: 'provider', retained: { uncertain: 'prepared-objects' } });
    expect(f.commands.branch).not.toHaveBeenCalled();
  });
  it.each(['branch', 'pull-request'] as const)('allows reviewed create-if-absent recovery only through an explicit %s policy', async uncertain => {
    const f = fixture();
    await new DeliverSetupInstallationUseCase().execute(f.commands, { ...f.control, recovery: 'reviewed-create-if-absent' },
      { preparedCommit: commit, effects: uncertain === 'branch' ? [] : ['branch'], uncertain });
    const command = uncertain === 'branch' ? f.commands.branch : f.commands.pullRequest;
    expect(command).toHaveBeenCalledWith(commit, false); expect(f.control.revalidate).toHaveBeenCalled();
  });
  it('retains each intent before its command and exact terminal facts afterward', async () => {
    const f = fixture();
    f.commands.prepareCommit.mockImplementation(async () => {
      expect(f.states.at(-1)?.uncertain).toBe('prepared-objects'); f.order.push('prepare'); return commit;
    });
    f.commands.branch.mockImplementation(async (sha, inspectOnly) => {
      expect(sha).toBe(commit); expect(inspectOnly).toBe(false); expect(f.states.at(-1)?.uncertain).toBe('branch'); f.order.push('branch');
    });
    f.commands.pullRequest.mockImplementation(async (sha, inspectOnly) => {
      expect(sha).toBe(commit); expect(inspectOnly).toBe(false); expect(f.states.at(-1)?.uncertain).toBe('pull-request'); f.order.push('pull-request'); return 42;
    });
    expect(await f.execute()).toEqual({ preparedCommit: commit, pullRequestNumber: 42, effects: ['branch', 'pull-request'], uncertain: undefined });
    expect(f.order).toEqual(['prepare', 'branch', 'pull-request']); expect(f.control.revalidate).toHaveBeenCalledTimes(3);
  });
  it('cancellation before effects performs no file command or journal write', async () => {
    const f = fixture(); f.control.active.mockReturnValue(false);
    await expect(f.execute()).rejects.toMatchObject({ reason: 'cancelled', retained: initial() });
    expect(f.order).toEqual([]); expect(f.states).toEqual([]); expect(f.control.revalidate).not.toHaveBeenCalled();
  });
  it('drift before effects performs no file command or journal write', async () => {
    const f = fixture(); f.control.revalidate.mockResolvedValue(false);
    await expect(f.execute()).rejects.toMatchObject({ reason: 'drift' }); expect(f.order).toEqual([]); expect(f.states).toEqual([]);
  });
  it('cancellation after a known prepared commit retains it and stops branch creation', async () => {
    const f = fixture();
    f.commands.prepareCommit.mockImplementation(async () => {
      f.order.push('prepare'); f.control.active.mockReturnValue(false); return commit;
    });
    await expect(f.execute()).rejects.toMatchObject({ reason: 'cancelled', retained: { preparedCommit: commit } });
    expect(f.order).toEqual(['prepare']); expect(f.states.at(-1)?.preparedCommit).toBe(commit);
  });
  it.each([
    ['prepared-objects', 'revalidation'], ['prepared-objects', 'intent'],
    ['branch', 'revalidation'], ['branch', 'intent'],
    ['pull-request', 'revalidation'], ['pull-request', 'intent'],
  ] as const)('cancellation during %s %s prevents dispatch and retains prior facts', async (phase, boundary) => {
    const f = fixture();
    const state: SetupInstallationDeliveryState = phase === 'prepared-objects' ? initial()
      : { preparedCommit: commit, effects: phase === 'branch' ? [] : ['branch'] };
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    if (boundary === 'revalidation') f.control.revalidate.mockImplementation(async () => {
      entered(); await held; return true;
    });
    else {
      const retain = f.control.retain.getMockImplementation()!;
      f.control.retain.mockImplementation(async next => { await retain(next); entered(); await held; });
    }
    const execution = f.execute(state).catch((error: unknown) => error);
    await reached;
    f.control.active.mockReturnValue(false); release();
    const error = await execution;
    expect(error).toBeInstanceOf(SetupInstallationDeliveryError);
    const knownNoObjectCommand = phase === 'prepared-objects' && boundary === 'intent';
    expect(error).toMatchObject({ reason: 'cancelled', retained: boundary === 'intent' && !knownNoObjectCommand ? { ...state, uncertain: phase } : state });
    expect(f.order).toEqual([]);
    expect(f.commands.prepareCommit).not.toHaveBeenCalled(); expect(f.commands.branch).not.toHaveBeenCalled();
    expect(f.commands.pullRequest).not.toHaveBeenCalled();
    expect(f.states).toEqual(boundary === 'intent' ? [{ ...state, uncertain: phase }, ...(knownNoObjectCommand ? [state] : [])] : []);
  });
  it('drift after the branch stops PR creation without deleting or rolling back the branch', async () => {
    const f = fixture(); f.control.revalidate.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(f.execute()).rejects.toMatchObject({ reason: 'drift', retained: { preparedCommit: commit, effects: ['branch'] } });
    expect(f.order).toEqual(['prepare', 'branch']); expect(f.commands.pullRequest).not.toHaveBeenCalled();
  });
  it('an unknown prepared-object outcome cannot automatically launch another preparation', async () => {
    const f = fixture(); f.commands.prepareCommit.mockRejectedValue(new Error('lost POST response'));
    let failure: SetupInstallationDeliveryError | undefined;
    try { await f.execute(); } catch (error) { failure = error as SetupInstallationDeliveryError; }
    expect(failure?.retained.uncertain).toBe('prepared-objects');
    await expect(f.execute(failure!.retained)).rejects.toMatchObject({ reason: 'uncertain-preparation' });
    expect(f.commands.prepareCommit).toHaveBeenCalledTimes(1); expect(f.commands.branch).not.toHaveBeenCalled();
  });
  it('a known prepared commit is reused and an uncertain branch is inspected without another POST', async () => {
    const f = fixture(); await f.execute({ preparedCommit: commit, effects: [], uncertain: 'branch' });
    expect(f.commands.prepareCommit).not.toHaveBeenCalled(); expect(f.commands.branch).toHaveBeenCalledWith(commit, true);
  });
  it('an uncertain PR is inspected without preparing objects, recreating the ref or blindly posting', async () => {
    const f = fixture(); await f.execute({ preparedCommit: commit, effects: ['branch'], uncertain: 'pull-request' });
    expect(f.order).toEqual(['pull-request']); expect(f.commands.pullRequest).toHaveBeenCalledWith(commit, true);
  });
  it('a retained completed delivery starts no additional command', async () => {
    const f = fixture(), state = { preparedCommit: commit, pullRequestNumber: 42, effects: ['branch', 'pull-request'] as const };
    expect(await f.execute(state)).toEqual(state); expect(f.order).toEqual([]); expect(f.states).toEqual([]);
  });
  it('a malformed prepared commit cannot reach branch creation', async () => {
    const f = fixture(); f.commands.prepareCommit.mockResolvedValue('unreviewed-ref');
    await expect(f.execute()).rejects.toMatchObject({ reason: 'provider' }); expect(f.commands.branch).not.toHaveBeenCalled();
  });
  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])('a malformed PR number %s cannot become a completed receipt', async number => {
    const f = fixture(); f.commands.pullRequest.mockResolvedValue(number);
    await expect(f.execute()).rejects.toMatchObject({ retained: { preparedCommit: commit, effects: ['branch'], uncertain: 'pull-request' } });
    expect(f.states.at(-1)?.effects).toEqual(['branch']);
  });
  it('a journal failure before preparation prevents all provider writes', async () => {
    const f = fixture(); f.control.retain.mockRejectedValue(new Error('private store unavailable'));
    await expect(f.execute()).rejects.toMatchObject({ retained: { uncertain: 'prepared-objects' } }); expect(f.order).toEqual([]);
  });
  it('a journal failure after a confirmed branch retains in-memory facts and prevents PR creation', async () => {
    const f = fixture(), original = f.control.retain.getMockImplementation()!;
    f.control.retain.mockImplementation(async state => {
      if (state.effects.includes('branch')) throw new Error('lost journal write'); await original(state);
    });
    await expect(f.execute()).rejects.toMatchObject({ retained: { preparedCommit: commit, effects: ['branch'] } });
    expect(f.order).toEqual(['prepare', 'branch']); expect(f.commands.pullRequest).not.toHaveBeenCalled();
  });
  it('a failed branch call preserves its uncertain identity for read-only recovery', async () => {
    const f = fixture(); f.commands.branch.mockRejectedValue(new Error('response unavailable'));
    await expect(f.execute({ preparedCommit: commit, effects: [] })).rejects.toMatchObject({ retained: { preparedCommit: commit, effects: [], uncertain: 'branch' } });
    expect(f.commands.pullRequest).not.toHaveBeenCalled();
  });
  it('a provider-confirmed snapshot change retains the drift meaning through common delivery', async () => {
    const f = fixture(); f.commands.prepareCommit.mockRejectedValue(new SetupInstallationSnapshotChanged());
    await expect(f.execute()).rejects.toMatchObject({ reason: 'drift' }); expect(f.commands.branch).not.toHaveBeenCalled();
  });
});
