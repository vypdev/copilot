import { vi } from 'vitest';
import { namedSessionsFixture } from './named_sessions.ts';
import { SessionObservationSource } from '../../src/application/session_observation_source.ts';
import { SessionObservations } from '../../src/application/session_observations.ts';
import type { ObserveSessionOperation } from '../../src/application/session_observation_ports.ts';
import type { SessionFact } from '../../src/domain/session_fact.ts';

export function sessionObserverFixture() {
    const f = namedSessionsFixture(); const owner = f.center.open();
    const snapshots: SessionFact[] = []; const captures: { engine: SessionObservations; source: SessionObservationSource; current(): boolean; label: string | null }[] = [];
    const observe = vi.fn<ObserveSessionOperation>((action, target, live) => {
        const source = new SessionObservationSource(() => f.center.controller.fence(owner.clientId));
        const current = () => { if (!live()) source.retire(); return source.current(); };
        const engine = new SessionObservations(action, fact => snapshots.push(fact), (a, b) => source.advance(a, b));
        captures.push({ engine, source, current, label: target.label }); return engine;
    });
    return { ...f, owner, observe, snapshots, captures, last: () => captures.at(-1)!,
        change: (input: Parameters<typeof f.connections.change>[0], revision = 0) => f.connections.change(input, revision, f.current, observe) };
}
