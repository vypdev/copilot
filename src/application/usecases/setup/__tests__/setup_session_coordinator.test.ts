import { SetupSessionCoordinator, type SetupSessionDecision, type SetupSessionPorts } from '../setup_session_coordinator';
import type { SetupOperationEffect } from '../../../../domain/setup';

const completed: SetupOperationEffect = { id: 'files', scope: 'local', state: 'completed' };
const uncertain: SetupOperationEffect = { id: 'secrets', scope: 'repository', state: 'needs-inspection' };

function fixture(overrides: Partial<SetupSessionPorts> = {}) {
  const calls: string[] = [];
  const ports: SetupSessionPorts = {
    repository: async () => { calls.push('repository'); return 'continue'; },
    choices: async () => { calls.push('choices'); return 'continue'; },
    setupPat: async () => { calls.push('setup-pat'); return 'continue'; },
    plan: async () => { calls.push('plan'); return 'continue'; },
    credentials: async () => { calls.push('credentials'); return 'continue'; },
    authorizeApply: async () => { calls.push('authorization'); return 'continue'; },
    apply: async effect => { calls.push('apply'); effect(completed); return { success: true, effects: [completed] }; },
    liveness: () => 'active',
    present: () => undefined,
    isCancellationError: () => false,
    ...overrides,
  };
  return { coordinator: new SetupSessionCoordinator(ports), calls };
}

describe('shared setup session coordinator', () => {
  test('runs semantic stages in order and returns an immutable resource receipt', async () => {
    const { coordinator, calls } = fixture();
    const result = await coordinator.execute();
    expect(calls).toEqual(['repository', 'choices', 'setup-pat', 'plan', 'credentials', 'authorization', 'apply']);
    expect(result).toMatchObject({ outcome: 'complete', mutationStarted: true, effects: [completed] });
    await expect(coordinator.execute()).rejects.toThrow('only once');
  });

  test.each([
    ['repository', 'cancelled', 'cancelled'],
    ['choices', 'blocked', 'blocked'],
    ['plan', 'dry-run', 'dry-run'],
    ['authorizeApply', 'cancelled', 'cancelled'],
  ] as const)('%s decision %s stops before Apply as %s', async (step, decision, outcome) => {
    const { coordinator, calls } = fixture({ [step]: async () => decision as SetupSessionDecision });
    expect(await coordinator.execute()).toMatchObject({ outcome, mutationStarted: false, effects: [] });
    expect(calls).not.toContain('apply');
  });

  test.each(['cancelled', 'expired'] as const)('liveness %s during awaited approval stops before mutation', async state => {
    let live: 'active' | typeof state = 'active';
    const { coordinator, calls } = fixture({
      authorizeApply: async () => { live = state; return 'continue'; },
      liveness: () => live,
    });
    expect(await coordinator.execute()).toMatchObject({ outcome: state === 'expired' ? 'blocked' : 'cancelled', mutationStarted: false });
    expect(calls).not.toContain('apply');
  });

  test('rejects concurrent execution while a phase is pending', async () => {
    let release!: (value: SetupSessionDecision) => void;
    const { coordinator } = fixture({ repository: () => new Promise(resolve => { release = resolve; }) });
    const first = coordinator.execute();
    await expect(coordinator.execute()).rejects.toThrow('only once');
    release('cancelled');
    expect((await first).outcome).toBe('cancelled');
  });

  test('an unknown provider outcome after the write boundary is partial, with retained facts', async () => {
    const error = new Error('connection dropped');
    const { coordinator } = fixture({ apply: async effect => { effect(uncertain); throw error; } });
    const result = await coordinator.execute();
    expect(result).toMatchObject({ outcome: 'partial', mutationStarted: true, effects: [uncertain], error });
  });

  test('a completed effect cannot be demoted by a later stale progress event', async () => {
    const { coordinator } = fixture({ apply: async effect => {
      effect(completed);
      effect({ ...completed, state: 'needs-inspection' });
      return { success: true, effects: [completed] };
    } });
    expect((await coordinator.execute()).effects).toEqual([completed]);
  });

  test('an unresolved in-progress write cannot produce a complete outcome', async () => {
    const { coordinator } = fixture({ apply: async effect => {
      effect({ id: 'secrets', state: 'in-progress', scope: 'repository' });
      return { success: true, effects: [] };
    } });
    expect(await coordinator.execute()).toMatchObject({ outcome: 'partial', effects: [uncertain] });
  });

  test('a possible credential-health write makes later cancellation partial', async () => {
    const { coordinator, calls } = fixture({
      credentials: async mark => { mark(); return 'cancelled'; },
    });
    expect(await coordinator.execute()).toMatchObject({ outcome: 'partial', mutationStarted: true });
    expect(calls).not.toContain('apply');
  });

  test.each(['cancelled', 'expired'] as const)('pending permission cleanup remains partial when %s arrives during the plan audit', async state => {
    let live: 'active' | typeof state = 'active';
    const { coordinator, calls } = fixture({
      plan: async cleanupPending => { cleanupPending(); live = state; return 'blocked'; },
      liveness: () => live,
    });
    expect(await coordinator.execute()).toMatchObject({ outcome: 'partial', mutationStarted: true });
    expect(calls).not.toContain('credentials');
    expect(calls).not.toContain('apply');
  });
});
