import { expect, it, vi } from 'vitest';
import { CURRENT_OWNER, currentOperationsFixture } from '../fixtures/current_operations.ts';
import type { CollectionSettled } from '../../src/domain/collection_review.ts';

const result: CollectionSettled = { state: 'settled', action: 'stop', kind: 'diagnostics', reason: 'busy', preference: { state: 'not-attempted', revision: 0 },
    observedPreference: null, preferenceVerifiedAtObservation: false, policy: { acknowledgement: 'not-attempted', observation: 'unavailable', revision: null, attributed: false },
    admittedAtObservation: false, sourceCurrentAtObservation: true };
const fixture = () => {
    const f = currentOperationsFixture(); return { ...f, observe: () => f.operations.reviewCollection(CURRENT_OWNER, 'diagnostics', 'stop', true, f.current)! };
};
it.each(['kind', 'action', 'required', 'owner', 'stopped', 'source'] as const)('invalid %s collection capture acquires no current entry or ticket', boundary => {
    const f = fixture(); if (boundary === 'stopped') f.operations.stop(); if (boundary === 'source') f.current.mockReturnValue(false);
    expect(f.operations.reviewCollection(boundary === 'owner' ? 'invalid' : CURRENT_OWNER, boundary === 'kind' ? 'private' as never : 'diagnostics',
        boundary === 'action' ? 'clear' as never : 'stop', boundary === 'required' ? 1 as never : true, f.current)).toBeNull(); expect(f.ports.admit).not.toHaveBeenCalled();
});
it('a native source failure irreversibly removes the collection target while retaining earlier facts', () => {
    const f = fixture(); const trace = f.observe(); f.current.mockReturnValue(false); expect(f.read()).toMatchObject({ sourceCurrent: false, target: null });
    f.current.mockReturnValue(true); trace.confirming(); trace.complete(result); expect(f.read()).toMatchObject({ family: 'collection', sourceCurrent: false, target: null, stage: 'settled' });
});
it('all collection previews share the existing eight-client cap without renewing another source or the initial timestamp', () => {
    const f = fixture(); f.observe(); const calls = f.current.mock.calls.length;
    for (let n = 1; n <= 8; n++) f.operations.reviewCollection(n.toString(16).padStart(32, '0'), 'recents', 'start', false, () => true);
    expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' }); expect(f.current).toHaveBeenCalledTimes(calls);
});
it('shutdown ignores late compound effects and never republishes or reacquires their history ticket', () => {
    const f = fixture(); f.retaining(true); const trace = f.observe(); trace.confirming(); f.operations.stop(); const count = f.ports.update.mock.calls.length;
    trace.preferenceSubmitted(); trace.complete(result); expect(f.ports.update).toHaveBeenCalledTimes(count); expect(f.ports.admit).toHaveBeenCalledOnce();
});
it('a later session owns the current slot while an old compound completion keeps only its original ticket', () => {
    const f = fixture(); f.retaining(true); const trace = f.observe(); const ticket = f.ports.admit.mock.results[0].value;
    f.operations.observeSession(CURRENT_OWNER, 'disconnect', { location: { route: 'connections' }, label: 'Local session' }, () => true,
        vi.fn(() => ({ controllerEpoch: 1, credentialEpoch: 1 })));
    trace.confirming(); trace.complete(result); expect(f.read()).toMatchObject({ family: 'sessions', stage: 'running' }); expect(f.ports.update.mock.lastCall?.[0]).toBe(ticket);
});
