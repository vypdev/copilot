import { expect, it, vi } from 'vitest';
import { ClearObservations } from '../../src/application/clear_observations.ts';
import { reportClear, acknowledgeClear, completeClear } from '../../src/application/clear_observation_ports.ts';
import { validClearFact } from '../../src/domain/clear_fact.ts';
import type { JournalClearOutcome } from '../../src/domain/journal_clear.ts';

const cleared = (): JournalClearOutcome => ({ state: 'observed-cleared', acknowledgement: 'accepted', epoch: 42, revision: 81, sourceCurrentAtObservation: true });
const fixture = () => { const changed = vi.fn(); const observer = new ClearObservations('diagnostics', changed); return { changed, observer }; };
it('construction and callbacks before confirmation cannot create a mutation observation', () => {
    const f = fixture(); f.observer.submitted(); f.observer.acknowledged('accepted'); f.observer.complete(cleared());
    expect(f.changed).not.toHaveBeenCalled(); expect(f.observer.fact.state).toBe('reviewed');
});
it('confirmation observes no submission and duplicate confirmation emits no change', () => {
    const f = fixture(); f.observer.confirming(); f.observer.confirming();
    expect(f.changed).toHaveBeenCalledOnce(); expect(f.observer.fact).toMatchObject({ state: 'running', submitted: false, acknowledgement: 'not-observed' });
});
it('an actual attempt is pending independently of acknowledgement and canonical read', () => {
    const f = fixture(); f.observer.confirming(); f.observer.submitted(); f.observer.submitted();
    expect(f.changed).toHaveBeenCalledTimes(2); expect(f.observer.fact).toMatchObject({ submitted: true, acknowledgement: 'unknown', observation: 'not-observed' });
    f.observer.acknowledged('accepted'); expect(f.observer.fact).toMatchObject({ state: 'running', acknowledgement: 'accepted', observation: 'not-observed' });
});
it('a missing attempt callback is disclosed and cannot be reconstructed from an accepted reply', () => {
    const f = fixture(); f.observer.confirming(); f.observer.acknowledged('accepted');
    expect(f.observer.fact).toMatchObject({ submitted: false, incomplete: true, acknowledgement: 'accepted' });
    f.observer.submitted(); expect(f.observer.fact).toMatchObject({ submitted: true, incomplete: true, acknowledgement: 'accepted' });
});
it('a final result with missing detailed callbacks remains incomplete without inventing an attempt', () => {
    const f = fixture(); f.observer.confirming(); f.observer.complete(cleared());
    expect(f.observer.fact).toMatchObject({ state: 'settled', submitted: false, incomplete: true, acknowledgement: 'accepted', observation: 'cleared' });
});
it('an accepted acknowledgement survives an uncertain summary without claiming an empty generation', () => {
    const f = fixture(); f.observer.confirming(); f.observer.submitted(); f.observer.acknowledged('accepted');
    f.observer.acknowledged('unknown'); f.observer.complete({ state: 'unknown', acknowledgement: 'unknown', observation: 'changed', sourceCurrentAtObservation: false });
    expect(f.observer.fact).toMatchObject({ state: 'settled', acknowledgement: 'accepted', observation: 'changed', sourceCurrentAtObservation: false });
});
it('invalid acknowledgement cannot poison later canonical completion', () => {
    const f = fixture(); f.observer.confirming(); f.observer.acknowledged('private' as never); f.observer.submitted(); f.observer.complete(cleared());
    expect(f.observer.fact).toMatchObject({ state: 'settled', incomplete: false, acknowledgement: 'accepted' });
});
it.each(['cancelled', 'blocked'] as const)('an unsubmitted %s review stays terminal despite late callbacks', event => {
    const f = fixture(); f.observer[event](); const fact = f.observer.fact;
    f.observer[event](); f.observer.confirming(); f.observer.submitted(); f.observer.acknowledged('accepted'); f.observer.complete(cleared());
    expect(f.observer.fact).toBe(fact); expect(fact.state).toBe(event);
});
it('cancellation and blocking after confirmation cannot pretend an in-flight operation was unsubmitted', () => {
    const f = fixture(); f.observer.confirming(); f.observer.cancelled(); f.observer.blocked();
    f.observer.complete({ state: 'cancelled' }); f.observer.complete({ state: 'pending' }); expect(f.observer.fact.state).toBe('running');
});
it.each(['not-started', 'aborted'] as const)('the native %s response has a closed no-write reason and no retrospective source fact', reason => {
    const f = fixture(); f.observer.confirming(); f.observer.submitted(); f.observer.complete({ state: 'not-applied', reason });
    expect(f.observer.fact).toMatchObject({ result: 'not-applied', acknowledgement: 'not-applied', observation: 'not-applied', notAppliedReason: reason, sourceCurrentAtObservation: null });
});
it('preflight rejection settles without making up a submission or canonical state', () => {
    const f = fixture(); f.observer.confirming(); f.observer.complete({ state: 'busy' });
    expect(f.observer.fact).toMatchObject({ state: 'settled', result: 'busy', submitted: false, acknowledgement: 'not-observed', observation: 'not-observed' });
});
it('a rejected attempted command preserves its negative acknowledgement separately from unavailable observation', () => {
    const f = fixture(); f.observer.confirming(); f.observer.submitted(); f.observer.acknowledged('not-applied'); f.observer.complete({ state: 'stale' });
    expect(f.observer.fact).toMatchObject({ result: 'stale', submitted: true, acknowledgement: 'not-applied', observation: 'unavailable' });
});
it('terminal observations cannot be rewritten by late availability and never retain native selectors or payload extras', () => {
    const f = fixture(); f.observer.confirming(); f.observer.submitted(); f.observer.complete({ ...cleared(), secret: 'private' } as never);
    const fact = f.observer.fact; const count = f.changed.mock.calls.length; f.observer.submitted(); f.observer.complete({ state: 'unavailable' }); f.observer.acknowledged('unknown');
    expect(f.observer.fact).toBe(fact); expect(f.changed).toHaveBeenCalledTimes(count); expect(Object.isFrozen(fact)).toBe(true);
    expect(JSON.stringify(fact)).not.toMatch(/epoch|revision|private/); expect(validClearFact(fact)).toBe(true);
});
it('secondary notification failure cannot escape into the native workflow or erase the facts', () => {
    const f = fixture(); f.changed.mockImplementation(() => { throw new Error('secondary'); });
    expect(() => { f.observer.confirming(); f.observer.submitted(); f.observer.acknowledged('accepted'); f.observer.complete(cleared()); }).not.toThrow();
    expect(f.observer.fact.state).toBe('settled');
});
it('closed reporting ports ignore absent observers and contain failing callbacks without mutating primary results', () => {
    for (const event of ['confirming', 'cancelled', 'blocked', 'submitted'] as const) { expect(() => reportClear(null, event)).not.toThrow(); expect(() => reportClear({ [event]: () => { throw new Error('secondary'); } } as never, event)).not.toThrow(); }
    expect(() => acknowledgeClear(null, 'unknown')).not.toThrow(); expect(() => completeClear(null, cleared())).not.toThrow();
    expect(() => acknowledgeClear({ acknowledged: () => { throw new Error('secondary'); } } as never, 'accepted')).not.toThrow();
    const source = cleared(); completeClear({ complete: (result: JournalClearOutcome) => { expect(Object.isFrozen(result)).toBe(true); expect(result).not.toBe(source); Object.defineProperty(result, 'state', { value: 'private' }); } } as never, source);
    expect(source.state).toBe('observed-cleared');
});
