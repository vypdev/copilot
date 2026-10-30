import { expect, it } from 'vitest';
import { CURRENT_OWNER, currentOperationsFixture } from '../fixtures/current_operations.ts';
import { decodeCurrentOperation } from '../../src/domain/current_operation.ts';
import { pauseSettled } from '../fixtures/pause_fact.ts';

const intent = { type: 'tab', tabId: 7, paused: true } as const;
const done = { state: 'committed', revision: 1, acknowledgement: 'accepted', current: true } as const;
const fixture = () => { const f = currentOperationsFixture(); return { ...f, reviewPause: () => f.operations.reviewPause(CURRENT_OWNER, intent, f.current)! }; };
it.each(['intent', 'owner', 'stopped', 'source'] as const)('invalid %s pause capture acquires no memory entry or history ticket', boundary => {
    const h = fixture(); if (boundary === 'stopped') h.operations.stop(); if (boundary === 'source') h.current.mockReturnValue(false);
    expect(h.operations.reviewPause(boundary === 'owner' ? 'invalid' : CURRENT_OWNER, boundary === 'intent' ? { ...intent, private: true } as never : intent, h.current)).toBeNull();
    expect(h.ports.admit).not.toHaveBeenCalled(); expect(h.operations.read(CURRENT_OWNER)).toEqual({ state: boundary === 'stopped' ? 'unavailable' : 'empty' });
});
it('current memory never includes native selectors, paths, revisions or operation identifiers', () => {
    const h = fixture(); h.reviewPause(); const value = h.read(); expect(value).toMatchObject({ family: 'pauses', stage: 'reviewed', retention: 'untracked', target: { location: { route: 'repositories' }, label: null } });
    for (const privateField of ['tabId', 'operationId', 'source', 'revision', 'witness']) expect(Object.keys(value.fact)).not.toContain(privateField);
    expect(JSON.stringify(value)).not.toContain('github.com'); expect(decodeCurrentOperation({ state: 'current', operation: value })).not.toBeNull();
});
it('one optional diagnostics ticket is captured at review and updated without re-admission', () => {
    const h = fixture(); h.retaining(true); const trace = h.reviewPause(); const ticket = h.ports.admit.mock.results[0].value;
    trace.confirming(); trace.submitted(); trace.acknowledged('accepted'); trace.settled({ acknowledgement: 'accepted', observation: 'committed' }); trace.complete(done);
    expect(h.ports.admit).toHaveBeenCalledOnce(); expect(h.ports.update.mock.calls.every(([value]) => value === ticket)).toBe(true);
    expect(h.read()).toMatchObject({ family: 'pauses', stage: 'settled', fact: { result: 'committed', acknowledgement: 'accepted' } });
});
it('turning diagnostics on after preview cannot backfill an off-history pause operation', () => {
    const h = fixture(); const trace = h.reviewPause(); h.retaining(true); trace.confirming(); trace.submitted(); trace.complete(done);
    expect(h.ports.admit).toHaveBeenCalledOnce(); expect(h.ports.update).not.toHaveBeenCalled(); expect(h.read().retention).toBe('untracked');
});
it('metadata reads do not progress, retain, resubmit or renew a pause operation', () => {
    const h = fixture(); h.retaining(true); h.reviewPause(); h.ports.admit.mockClear(); h.ports.update.mockClear(); h.at(300999);
    expect(h.read().firstObserved).toBe(1000); h.retention('stored'); expect(h.read().retention).toBe('stored');
    h.at(301000); expect(h.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' }); expect(h.ports.admit).not.toHaveBeenCalled(); expect(h.ports.update).not.toHaveBeenCalled();
});
it('retired pause context never regains its private local destination even if the port later reports live', () => {
    const h = fixture(); const trace = h.reviewPause(); h.current.mockReturnValue(false); expect(h.read()).toMatchObject({ sourceCurrent: false, target: null });
    h.current.mockReturnValue(true); trace.confirming(); trace.submitted(); trace.complete(done); expect(h.read()).toMatchObject({ sourceCurrent: false, target: null, fact: { result: 'committed' } });
});
it('a late pause result cannot overwrite a newer current operation or borrow its ticket', () => {
    const h = fixture(); h.retaining(true); const trace = h.reviewPause(); const ticket = h.ports.admit.mock.results[0].value; h.review();
    trace.confirming(); trace.submitted(); trace.complete(done); expect(h.read().family).toBe('settings'); expect(h.ports.update.mock.lastCall?.[0]).toBe(ticket);
});
it('failed optional sinks preserve inspectable primary pause facts without fallback append', () => {
    const h = fixture(); h.ports.admit.mockImplementation(() => { throw new Error('history offline'); }); const trace = h.reviewPause(); trace.confirming(); trace.complete({ state: 'conflict' });
    expect(h.read()).toMatchObject({ stage: 'settled', retention: 'untracked', fact: { result: 'conflict', submitted: false } }); expect(h.ports.admit).toHaveBeenCalledOnce();
    const other = fixture(); other.retaining(true); other.ports.update.mockImplementation(() => { throw new Error('write unavailable'); }); const later = other.reviewPause(); later.confirming(); later.complete(done);
    expect(other.read()).toMatchObject({ fact: { result: 'committed', incomplete: true } }); expect(other.ports.admit).toHaveBeenCalledOnce();
});
it('shutdown ignores late pause callbacks and cannot reacquire a retired ticket', () => {
    const h = fixture(); h.retaining(true); const trace = h.reviewPause(); h.operations.stop(); const count = h.ports.update.mock.calls.length;
    trace.confirming(); trace.submitted(); trace.complete(done); expect(h.ports.update).toHaveBeenCalledTimes(count); expect(h.operations.read(CURRENT_OWNER)).toEqual({ state: 'unavailable' });
});
it('the decoder rejects inconsistent lifecycle, private fields and invalid source targets', () => {
    const h = fixture(); h.reviewPause(); const operation = h.read();
    for (const patch of [{ family: 'foreign' }, { stage: 'settled' }, { fact: { ...operation.fact, private: 'secret' } }, { sourceCurrent: 1 }, { sourceCurrent: false },
        { firstObserved: -1 }, { retention: 'private' }, { target: { location: { route: 'foreign' }, label: null } }]) expect(decodeCurrentOperation({ state: 'current', operation: { ...operation, ...patch } })).toBeNull();
});
it('a historical completion can report a negative observation source without reconstructing a private target', () => {
    const operation = { family: 'pauses', stage: 'settled', fact: { ...pauseSettled(), sourceCurrentAtObservation: false }, target: null, sourceCurrent: false, firstObserved: 0, retention: 'untracked' };
    expect(decodeCurrentOperation({ state: 'current', operation })).not.toBeNull();
});
