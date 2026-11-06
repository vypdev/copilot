import { expect, it, vi } from 'vitest';
import { CURRENT_OWNER, currentOperationsFixture } from '../fixtures/current_operations.ts';

const target = { location: { route: 'connections' as const }, label: 'Private session' };
function fixture() {
    const f = currentOperationsFixture(); const query = vi.fn(() => ({ controllerEpoch: 1, credentialEpoch: 2 }));
    return { ...f, query, observe: () => f.operations.observeSession(CURRENT_OWNER, 'connect', target, f.current, query)! };
}
it('own epoch advances preserve only the current session target, independently from optional retention', () => {
    const f = fixture(); const trace = f.observe(); f.query.mockReturnValue({ controllerEpoch: 1, credentialEpoch: 3 }); trace.credential(2, 3);
    trace.complete('ready'); expect(f.read()).toMatchObject({ family: 'sessions', sourceCurrent: true, target, stage: 'settled', retention: 'untracked' });
    expect(f.ports.admit).toHaveBeenCalledOnce(); expect(f.ports.update).not.toHaveBeenCalled();
});
it('a lost primary service generation permanently retires the session witness even after the generic live callback recovers', () => {
    const f = fixture(); const trace = f.observe(); f.current.mockReturnValue(false); expect(f.read()).toMatchObject({ sourceCurrent: false, target: null });
    f.current.mockReturnValue(true); trace.complete('ready'); expect(f.read()).toMatchObject({ sourceCurrent: false, target: null });
});
it.each(['stopped', 'owner', 'action', 'target', 'source'] as const)('invalid %s admission cannot acquire a session ticket', boundary => {
    const f = fixture(); if (boundary === 'stopped') f.operations.stop(); if (boundary === 'source') f.current.mockReturnValue(false);
    expect(f.operations.observeSession(boundary === 'owner' ? 'invalid' : CURRENT_OWNER, boundary === 'action' ? 'private' as never : 'connect',
        boundary === 'target' ? { ...target, label: '' } : target, f.current, f.query)).toBeNull(); expect(f.ports.admit).not.toHaveBeenCalled();
});
it.each(['stop', 'invalidate'] as const)('a reentrant native query that requests %s cannot acquire a fresh session witness', boundary => {
    const f = fixture(); f.query.mockImplementationOnce(() => { f.operations[boundary](); return { controllerEpoch: 1, credentialEpoch: 2 }; });
    expect(f.observe()).toBeNull(); expect(f.ports.admit).not.toHaveBeenCalled();
});
it('stopping the owner prevents every late trace callback from notifying, writing or consulting a private native source', () => {
    const f = fixture(); f.retaining(true); const trace = f.observe(); const step = trace.step('save-active')!; step.submitted(); f.operations.stop();
    const queries = f.query.mock.calls.length; const updates = f.ports.update.mock.calls.length; const notifications = f.ports.changed.mock.calls.length;
    trace.credential(2, 3); step.settled({ acknowledgement: 'accepted', observation: 'committed' }); trace.complete('ready');
    expect(f.query).toHaveBeenCalledTimes(queries); expect(f.ports.update).toHaveBeenCalledTimes(updates); expect(f.ports.changed).toHaveBeenCalledTimes(notifications);
});
it('an old session completion updates only its own admitted history ticket after a newer preference review replaces it', () => {
    const f = fixture(); f.retaining(true); const trace = f.observe(); const ticket = f.ports.admit.mock.results[0].value;
    f.review(); trace.complete('unavailable'); expect(f.read()).toMatchObject({ family: 'settings', stage: 'reviewed' }); expect(f.ports.update.mock.lastCall?.[0]).toBe(ticket);
});
