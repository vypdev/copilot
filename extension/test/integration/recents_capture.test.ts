import { expect, it } from 'vitest';
import { RECENT_SOURCE, recentsCaptureFixture as fixture } from '../fixtures/recents_capture.ts';

it('constructs without I/O, mints a source permit only for known consent/epoch and reuses a live permit without another identifier', () => {
    const f = fixture(); expect(f.ports.admission).not.toHaveBeenCalled(); f.active(false); expect(f.producer.capture(RECENT_SOURCE, f.current)).toEqual({ state: 'ready', permit: null, epoch: 0, sequence: 0 });
    f.active(true); f.epoch(null); expect(f.producer.capture(RECENT_SOURCE, f.current)).toEqual({ state: 'ready', permit: null, epoch: null, sequence: 0 });
    f.epoch(0); const permit = f.capture(); expect(f.capture()).toBe(permit); expect(f.ports.identifier).toHaveBeenCalledOnce(); expect(f.ports.admit).not.toHaveBeenCalled();
});
it('admits only closed destinations and passes a live source/consent/generation fence to the actual writer port', () => {
    const f = fixture(); const permit = f.capture(); expect(f.producer.observe(RECENT_SOURCE, permit, 1, { route: 'privacy' }, f.current)).toEqual({ state: 'observed' });
    const [fact, current] = f.ports.admit.mock.calls[0]; expect(fact).toEqual({ kind: 'destination', route: 'privacy' }); expect(current()).toBe(true);
    f.active(false); expect(current()).toBe(false); f.producer.retire(); f.active(true); expect(current()).toBe(false);
    expect(f.producer.observe(RECENT_SOURCE, permit, 1, { route: 'privacy' }, f.current)).toEqual({ state: 'stale' });
});
it('duplicate consecutive delivery has no second append and distinct accepted destinations remain distinct', () => {
    const f = fixture(); const permit = f.capture(); const first = f.producer.observe(RECENT_SOURCE, permit, 1, { route: 'privacy' }, f.current);
    expect(f.producer.observe(RECENT_SOURCE, permit, 1, { route: 'privacy' }, f.current)).toBe(first); expect(f.ports.admit).toHaveBeenCalledOnce();
    f.producer.observe(RECENT_SOURCE, permit, 2, { route: 'features', featureId: 'BEX-NAV-01' }, f.current); f.producer.observe(RECENT_SOURCE, permit, 3, { route: 'privacy' }, f.current);
    expect(f.ports.admit).toHaveBeenCalledTimes(3);
});
it.each(['documentId', 'tabId', 'controllerEpoch', 'credentialEpoch', 'clientId'] as const)('a %s change cannot consume the old source permit', key => {
    const f = fixture(); const permit = f.capture(); const source = { ...RECENT_SOURCE, [key]: typeof RECENT_SOURCE[key] === 'number' ? 2 : 'different' };
    expect(f.producer.observe(source, permit, 1, { route: 'privacy' }, f.current)).toEqual({ state: 'stale' }); expect(f.ports.admit).not.toHaveBeenCalled();
});
it.each([null, 1])('losing/changing generation to %j irreversibly retires a permit, including after recovery', epoch => {
    const f = fixture(); const permit = f.capture(); f.epoch(epoch); f.producer.retire(); f.epoch(0);
    expect(f.producer.observe(RECENT_SOURCE, permit, 1, { route: 'privacy' }, f.current)).toEqual({ state: 'stale' }); expect(f.capture()).not.toBe(permit);
});
it('retains at most8 source entries and prunes without calling another native source guard', () => {
    const f = fixture(); const first = f.capture(); const count = f.current.mock.calls.length;
    for (let i = 1; i <= 8; i++) f.capture({ ...RECENT_SOURCE, clientId: i.toString(16).padStart(32, '0') });
    expect(f.current).toHaveBeenCalledTimes(count + 16); // Only each current caller's admission and post-mint recheck.
    f.producer.retire(); expect(f.current).toHaveBeenCalledTimes(count + 16);
    expect(f.producer.observe(RECENT_SOURCE, first, 1, { route: 'privacy' }, f.current)).toEqual({ state: 'stale' });
});
it('invalid or unavailable identifiers, admission and epoch ports never become recording authority', () => {
    const f = fixture(); f.ports.identifier.mockReturnValueOnce('wrong'); expect(f.producer.capture(RECENT_SOURCE, f.current)).toEqual({ state: 'unavailable' });
    f.ports.identifier.mockImplementationOnce(() => { throw new Error('private'); }); expect(f.producer.capture(RECENT_SOURCE, f.current)).toEqual({ state: 'unavailable' });
    const permit = f.capture(); f.ports.identifier.mockReturnValueOnce(permit.slice(6)); expect(f.producer.capture({ ...RECENT_SOURCE, clientId: 'b'.repeat(32) }, f.current)).toEqual({ state: 'unavailable' });
    f.ports.epoch.mockImplementationOnce(() => { throw new Error('private'); }); f.producer.retire(); expect(f.capture()).not.toBe(permit);
});
it('does not mint after source or consent movement reenters the identifier boundary', () => {
    const f = fixture(); f.ports.identifier.mockImplementationOnce(() => { f.active(false); return 'c'.repeat(32); });
    expect(f.producer.capture(RECENT_SOURCE, f.current)).toEqual({ state: 'stale' }); expect(f.ports.admit).not.toHaveBeenCalled();
    f.active(true); f.current.mockReturnValueOnce(false); expect(f.producer.capture(RECENT_SOURCE, f.current)).toEqual({ state: 'stale' });
});
it('reentrant capture reuses its already registered source and reentrant duplicate observation submits once', () => {
    const f = fixture(); let nested: string | null = null;
    f.ports.identifier.mockImplementationOnce(() => { nested = f.capture(); return 'c'.repeat(32); }); expect(f.capture()).toBe(nested);
    f.ports.admit.mockImplementationOnce(() => { f.producer.observe(RECENT_SOURCE, nested!, 1, { route: 'privacy' }, f.current); });
    f.producer.observe(RECENT_SOURCE, nested!, 1, { route: 'privacy' }, f.current); expect(f.ports.admit).toHaveBeenCalledOnce();
});
it('a failed observation keeps the same uncertain answer on duplicate delivery without a retry', () => {
    const f = fixture(); const permit = f.capture(); f.ports.admit.mockImplementationOnce(() => { throw new Error('private'); });
    const result = f.producer.observe(RECENT_SOURCE, permit, 1, { route: 'privacy' }, f.current); expect(result).toEqual({ state: 'unavailable' });
    expect(f.producer.observe(RECENT_SOURCE, permit, 1, { route: 'privacy' }, f.current)).toBe(result); expect(f.ports.admit).toHaveBeenCalledOnce();
});
it('rejects invalid facts/tokens, source denial and all captures after disposal', () => {
    const f = fixture(); const permit = f.capture(); expect(f.producer.observe(RECENT_SOURCE, 'a'.repeat(32), 1, { route: 'privacy' }, f.current)).toEqual({ state: 'invalid' });
    expect(f.producer.observe(RECENT_SOURCE, permit, 1, { route: 'profiles', private: 'label' } as never, f.current)).toEqual({ state: 'invalid' });
    f.current.mockReturnValue(false); expect(f.producer.observe(RECENT_SOURCE, permit, 1, { route: 'privacy' }, f.current)).toEqual({ state: 'stale' });
    f.producer.stop(); expect(f.producer.capture(RECENT_SOURCE, () => true)).toEqual({ state: 'stale' }); expect(f.ports.admit).not.toHaveBeenCalled();
});
it('equal-sequence semantic replays ignore property order, changed payload is invalid and earlier sequence is stale', () => {
    const f = fixture(); const permit = f.capture(); const first = f.producer.observe(RECENT_SOURCE, permit, 4, { route: 'features', featureId: 'BEX-NAV-01' }, f.current);
    expect(f.producer.observe(RECENT_SOURCE, permit, 4, { featureId: 'BEX-NAV-01', route: 'features' }, f.current)).toBe(first);
    expect(f.producer.observe(RECENT_SOURCE, permit, 4, { route: 'privacy' }, f.current)).toEqual({ state: 'invalid' });
    expect(f.producer.observe(RECENT_SOURCE, permit, 3, { route: 'privacy' }, f.current)).toEqual({ state: 'stale' }); expect(f.ports.admit).toHaveBeenCalledOnce();
});
it('an exhausted delivery counter rotates only the ephemeral namespace, keeping its history epoch and never replaying its event', () => {
    const f = fixture(); const old = f.capture(); f.producer.observe(RECENT_SOURCE, old, Number.MAX_SAFE_INTEGER, { route: 'privacy' }, f.current);
    const next = f.producer.capture(RECENT_SOURCE, f.current); expect(next).toMatchObject({ state: 'ready', epoch: 0, sequence: 0 });
    if (next.state !== 'ready') throw new Error('missing'); expect(next.permit).not.toBe(old); expect(f.ports.admit).toHaveBeenCalledOnce();
    expect(f.producer.observe(RECENT_SOURCE, old, 1, { route: 'work' }, f.current)).toEqual({ state: 'stale' });
});
it('consent movement reentering a source check retires the permit before the writer is called', () => {
    const f = fixture(); const permit = f.capture();
    const current = () => { f.active(false); f.producer.retire(); return true; };
    expect(f.producer.observe(RECENT_SOURCE, permit, 1, { route: 'privacy' }, current)).toEqual({ state: 'stale' }); expect(f.ports.admit).not.toHaveBeenCalled();
});
it('generation metadata becoming unavailable inside the source check fails closed without a recording exception', () => {
    const f = fixture(); const permit = f.capture(); const current = () => { f.ports.epoch.mockImplementation(() => { throw new Error('private'); }); return true; };
    expect(f.producer.observe(RECENT_SOURCE, permit, 1, { route: 'privacy' }, current)).toEqual({ state: 'stale' }); expect(f.ports.admit).not.toHaveBeenCalled();
});
it.each([0, -1, NaN, Number.MAX_SAFE_INTEGER + 1])('invalid delivery sequence %s cannot consume a permit', sequence => {
    const f = fixture(); const permit = f.capture(); expect(f.producer.observe(RECENT_SOURCE, permit, sequence, { route: 'privacy' }, f.current)).toEqual({ state: 'invalid' }); expect(f.ports.admit).not.toHaveBeenCalled();
});
