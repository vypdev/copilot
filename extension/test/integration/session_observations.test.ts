import { expect, it, vi } from 'vitest';
import { SessionObservations } from '../../src/application/session_observations.ts';
import { validSessionFact } from '../../src/domain/session_fact.ts';
import { protectedMutation } from '../../src/application/protected_mutation.ts';
import { deferred } from '../fixtures/runtime.ts';

const fixture = () => { const changed = vi.fn(); const advance = vi.fn(); return { changed, advance, observer: new SessionObservations('connect', changed, advance) }; };
it('constructs inertly with no source query or synthetic storage attempt', () => {
    const f = fixture(); expect(f.changed).not.toHaveBeenCalled(); expect(f.advance).not.toHaveBeenCalled(); expect(f.observer.fact).toMatchObject({ state: 'running', effects: [] });
});
it('registers a step only after actual invocation and keeps uncertain acknowledgement separate from canonical success', async () => {
    const f = fixture(); const trace = f.observer.step('save-active'); expect(f.observer.fact.effects).toEqual([]);
    await protectedMutation(() => { expect(f.observer.fact.effects).toEqual([]); throw new Error('private'); }, async () => true, trace);
    expect(f.observer.fact.effects).toEqual([{ ordinal: 1, effect: 'save-active', state: 'settled', acknowledgement: 'unknown', observation: 'committed' }]);
});
it('actual pending storage exposes only a submitted fact, without inventing persistence', async () => {
    const f = fixture(); const gate = deferred<void>(); const pending = protectedMutation(() => gate.promise, async () => true, f.observer.step('save-active'));
    expect(f.observer.fact.effects[0]).toMatchObject({ state: 'submitted', acknowledgement: 'unknown', observation: 'not-observed' }); gate.resolve(); await pending;
});
it('a settlement without an observed native attempt cannot invent a submitted step', () => {
    const f = fixture(); f.observer.step('save-active').settled({ acknowledgement: 'accepted', observation: 'committed' }); expect(f.observer.fact.effects).toEqual([]);
});
it('duplicate callbacks cannot create another effect or rewrite a settled result', () => {
    const f = fixture(); const step = f.observer.step('save-active'); step.submitted(); step.submitted(); step.settled({ acknowledgement: 'accepted', observation: 'committed' });
    step.settled({ acknowledgement: 'unknown', observation: 'unavailable' }); expect(f.observer.fact.effects).toHaveLength(1); expect(f.observer.fact.effects[0].observation).toBe('committed');
});
it('independent native attempts may settle out of order while preserving their actual attempt order', () => {
    const f = fixture(); const active = f.observer.step('save-active'); const vault = f.observer.step('save-vault'); active.submitted(); vault.submitted();
    vault.settled({ acknowledgement: 'accepted', observation: 'committed' }); expect(f.observer.fact.effects.map(e => e.state)).toEqual(['submitted', 'settled']);
    active.settled({ acknowledgement: 'unknown', observation: 'different' }); f.observer.complete('unknown'); expect(validSessionFact(f.observer.fact)).toBe(true);
});
it('a cleanup is a new effect and cannot erase an earlier verified candidate save', () => {
    const f = fixture(); const save = f.observer.step('save-active'); save.submitted(); save.settled({ acknowledgement: 'accepted', observation: 'committed' });
    const cleanup = f.observer.step('cleanup-active'); cleanup.submitted(); cleanup.settled({ acknowledgement: 'unknown', observation: 'committed' }); f.observer.complete('unavailable');
    expect(f.observer.fact.effects.map(e => e.effect)).toEqual(['save-active', 'cleanup-active']); expect(f.observer.fact.result).toBe('unavailable');
});
it('terminal service completion marks unfinished observations incomplete without fabricating their result', () => {
    const f = fixture(); f.observer.step('save-active').submitted(); f.observer.complete('ready'); expect(f.observer.fact).toMatchObject({ state: 'settled', result: 'ready', incomplete: true });
    expect(f.observer.fact.effects[0].state).toBe('submitted');
});
it('late effects, duplicate completion and credential callbacks cannot alter terminal evidence', () => {
    const f = fixture(); const step = f.observer.step('save-active'); f.observer.complete('stale'); const value = f.observer.fact;
    step.submitted(); step.settled({ acknowledgement: 'accepted', observation: 'committed' }); f.observer.complete('ready'); f.observer.credential(1, 2);
    expect(f.observer.fact).toBe(value); expect(f.advance).not.toHaveBeenCalled();
});
it('bounded capture retains at most16 effects and discloses overflow exactly once', () => {
    const f = fixture(); for (let i = 0; i < 16; i++) { const step = f.observer.step('retire-active'); step.submitted(); step.settled({ acknowledgement: 'accepted', observation: 'committed' }); }
    const overflow = f.observer.step('retire-active'); overflow.submitted(); const count = f.changed.mock.calls.length; overflow.submitted(); overflow.settled({ acknowledgement: 'accepted', observation: 'committed' });
    expect(f.observer.fact.effects).toHaveLength(16); expect(f.observer.fact.incomplete).toBe(true); expect(f.changed).toHaveBeenCalledTimes(count);
});
it('invalid native effect codes disclose incomplete capture without accepting private payloads', () => {
    const f = fixture(); f.observer.step('private' as never).submitted(); f.observer.step('private' as never).submitted(); expect(f.observer.fact).toMatchObject({ effects: [], incomplete: true });
});
it('malformed mutation results cannot turn a pending attempt into proved storage', () => {
    const f = fixture(); const step = f.observer.step('save-active'); step.submitted(); step.settled({ acknowledgement: 'private', observation: 'committed' } as never);
    step.settled({ acknowledgement: 'accepted', observation: 'private' } as never); expect(f.observer.fact.effects[0].state).toBe('submitted');
});
it('closed projection never copies extra fields or freezes the caller’s mutation result', () => {
    const f = fixture(); const step = f.observer.step('save-active'); step.submitted(); const outcome = { acknowledgement: 'accepted', observation: 'committed', secret: 'private' } as const;
    step.settled(outcome); expect(JSON.stringify(f.observer.fact)).not.toContain('private'); expect(Object.isFrozen(outcome)).toBe(false);
});
it('immutable snapshots do not follow later step updates or allow a sink to corrupt the evidence', () => {
    const f = fixture(); const before = f.observer.fact; f.changed.mockImplementation(value => { value.result = 'private'; });
    const step = f.observer.step('save-active'); step.submitted(); expect(before.effects).toEqual([]); expect(validSessionFact(f.observer.fact)).toBe(true);
});
it('own-epoch reporting failure is secondary and malformed service completion cannot close an operation', () => {
    const f = fixture(); f.advance.mockImplementation(() => { throw new Error('private'); }); expect(() => f.observer.credential(1, 2)).not.toThrow();
    f.observer.complete('private' as never); expect(f.observer.fact.state).toBe('running');
});
