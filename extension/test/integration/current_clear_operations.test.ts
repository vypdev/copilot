import { expect, it } from 'vitest';
import { CURRENT_OWNER, currentOperationsFixture } from '../fixtures/current_operations.ts';
import { decodeCurrentOperation } from '../../src/domain/current_operation.ts';
import { clearSettled } from '../fixtures/clear_fact.ts';

const fixture = () => { const f = currentOperationsFixture(); return { ...f, observe: (kind: 'diagnostics' | 'recents' = 'diagnostics') => f.operations.reviewClear(CURRENT_OWNER, kind, f.current)! }; };
const outcome = { state: 'observed-cleared', acknowledgement: 'accepted', epoch: 1, revision: 2, sourceCurrentAtObservation: true } as const;
it.each(['kind', 'owner', 'stopped', 'source'] as const)('invalid %s clear capture acquires no current entry or optional ticket', boundary => {
    const f = fixture(); if (boundary === 'stopped') f.operations.stop(); if (boundary === 'source') f.current.mockReturnValue(false);
    expect(f.operations.reviewClear(boundary === 'owner' ? 'private' : CURRENT_OWNER, boundary === 'kind' ? 'private' as never : 'diagnostics', f.current)).toBeNull();
    expect(f.ports.admit).not.toHaveBeenCalled(); expect(f.ports.changed).not.toHaveBeenCalled();
});
it('diagnostics deletion never calls secondary admission even when its cache incorrectly still permits retention', () => {
    const f = fixture(); f.retaining(true); const trace = f.observe(); trace.confirming(); trace.submitted(); trace.complete(outcome);
    expect(f.ports.admit).not.toHaveBeenCalled(); expect(f.ports.update).not.toHaveBeenCalled(); expect(f.ports.retention).not.toHaveBeenCalled();
    expect(f.read()).toMatchObject({ family: 'clear', stage: 'settled', retention: 'untracked', target: { location: { route: 'privacy' }, label: null } });
});
it('recents deletion admits at most one diagnostics ticket and uses that exact ticket throughout its independent phases', () => {
    const f = fixture(); f.retaining(true); const trace = f.observe('recents'); const ticket = f.ports.admit.mock.results[0].value;
    trace.confirming(); trace.submitted(); trace.acknowledged('accepted'); trace.complete(outcome);
    expect(f.ports.admit).toHaveBeenCalledOnce(); expect(f.ports.update.mock.calls.every(([value]) => value === ticket)).toBe(true);
    expect(f.read()).toMatchObject({ family: 'clear', fact: { collection: 'recents', result: 'observed-cleared' } });
});
it('diagnostics turned on later cannot retrospectively retain a recents clear captured while off', () => {
    const f = fixture(); const trace = f.observe('recents'); f.retaining(true); trace.confirming(); trace.submitted(); trace.complete(outcome);
    expect(f.ports.admit).toHaveBeenCalledOnce(); expect(f.ports.update).not.toHaveBeenCalled(); expect(f.read().retention).toBe('untracked');
});
it('metadata-only reads report secondary retention without re-admitting, updating or mutating primary facts', () => {
    const f = fixture(); f.retaining(true); f.observe('recents'); f.ports.admit.mockClear(); f.ports.update.mockClear();
    expect(f.read().retention).toBe('pending'); f.retention('stored'); expect(f.read().retention).toBe('stored');
    expect(f.ports.admit).not.toHaveBeenCalled(); expect(f.ports.update).not.toHaveBeenCalled();
});
it('source loss irreversibly retires the private clear destination without erasing the historical effects', () => {
    const f = fixture(); const trace = f.observe(); trace.confirming(); f.current.mockReturnValue(false); expect(f.read()).toMatchObject({ sourceCurrent: false, target: null });
    f.current.mockReturnValue(true); trace.submitted(); trace.complete(outcome); expect(f.read()).toMatchObject({ sourceCurrent: false, target: null, stage: 'settled' });
});
it('the original five-minute clear lifetime is not renewed by callback progress or metadata reads', () => {
    const f = fixture(); const trace = f.observe(); f.at(300999); trace.confirming(); expect(f.read().firstObserved).toBe(1000);
    f.at(301000); trace.submitted(); trace.complete(outcome); expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' });
});
it('clear shares the eight-client cap with other operation families and does not touch an evicted source', () => {
    const f = fixture(); f.observe(); const calls = f.current.mock.calls.length;
    for (let n = 1; n <= 8; n++) f.operations.reviewSettings(n.toString(16).padStart(32, '0'), 'preferences', { location: { route: 'language' }, label: null }, () => true);
    expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' }); expect(f.current).toHaveBeenCalledTimes(calls);
});
it('shutdown ignores late clear effects and never reacquires the retired diagnostics ticket', () => {
    const f = fixture(); f.retaining(true); const trace = f.observe('recents'); trace.confirming(); f.operations.stop(); const count = f.ports.update.mock.calls.length;
    trace.submitted(); trace.complete(outcome); expect(f.ports.update).toHaveBeenCalledTimes(count); expect(f.ports.admit).toHaveBeenCalledOnce();
});
it('an old clear cannot overwrite a newer settings review or borrow its history ticket', () => {
    const f = fixture(); f.retaining(true); const trace = f.observe('recents'); const ticket = f.ports.admit.mock.results[0].value; f.review();
    trace.confirming(); trace.submitted(); trace.complete(outcome); expect(f.read().family).toBe('settings'); expect(f.ports.update.mock.lastCall?.[0]).toBe(ticket);
});
it('failed secondary admission and update leave native clear facts inspectable without a fallback append', () => {
    const f = fixture(); f.ports.admit.mockImplementationOnce(() => { throw new Error('secondary'); }); const trace = f.observe('recents');
    trace.confirming(); trace.submitted(); trace.complete(outcome); expect(f.read()).toMatchObject({ stage: 'settled', retention: 'untracked' }); expect(f.ports.admit).toHaveBeenCalledOnce();
    const g = fixture(); g.retaining(true); g.ports.update.mockImplementation(() => { throw new Error('secondary'); }); const later = g.observe('recents'); later.confirming(); later.complete({ state: 'busy' }); expect(g.read().stage).toBe('settled');
});
it('clear metadata accepts only matching lifecycle and closed fact schemas without stale private targets', () => {
    const f = fixture(); f.observe(); const operation = f.read(); expect(decodeCurrentOperation({ state: 'current', operation })).toEqual({ state: 'current', operation });
    for (const patch of [{ stage: 'private' }, { fact: { ...operation.fact, secret: 'private' } }, { retention: 'private' },
        { sourceCurrent: false }, { firstObserved: -1 }, { target: { location: { route: 'private' }, label: null } }]) expect(decodeCurrentOperation({ state: 'current', operation: { ...operation, ...patch } })).toBeNull();
});
it('a settled decode can disclose source loss as false while the current target remains unavailable', () => {
    const operation = { family: 'clear', stage: 'settled', fact: { ...clearSettled(), sourceCurrentAtObservation: false }, target: null, sourceCurrent: false, firstObserved: 0, retention: 'untracked' };
    expect(decodeCurrentOperation({ state: 'current', operation })).not.toBeNull(); expect(decodeCurrentOperation({ state: 'current', operation: { ...operation, stage: 'reviewed' } })).toBeNull();
});
