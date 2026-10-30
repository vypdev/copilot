import { expect, it } from 'vitest';
import { CURRENT_OWNER, CURRENT_TARGET, currentOperationsFixture as fixture } from '../fixtures/current_operations.ts';
import { settingsObservation } from '../../src/domain/settings_observation.ts';

it('constructs without I/O and supplies a private current target when history is untracked', () => {
    const f = fixture(); expect(f.ports.now).not.toHaveBeenCalled(); expect(f.ports.admit).not.toHaveBeenCalled(); f.review();
    expect(f.read()).toMatchObject({ stage: 'reviewed', target: CURRENT_TARGET, retention: 'untracked', firstObserved: 1000 });
    expect(JSON.stringify(f.ports.admit.mock.calls[0][0])).not.toContain('Private'); expect(f.ports.retention).not.toHaveBeenCalled();
});
it('confirmation pending is distinct from actual submission, and known completion cannot be downgraded', () => {
    const f = fixture(); f.retaining(true); const trace = f.review(); trace.confirming(); expect(f.read()).toMatchObject({ stage: 'confirming', fact: { phase: 'reviewed' } });
    trace.submitted(); trace.submitted(); expect(f.ports.update).toHaveBeenCalledTimes(1);
    trace.complete({ state: 'committed', revision: 1, acknowledgement: 'accepted', current: true });
    trace.complete({ state: 'unknown', acknowledgement: 'unknown', observation: 'unavailable', observedRevision: null }); trace.confirming();
    expect(f.read()).toMatchObject({ stage: 'settled', fact: { acknowledgement: 'accepted', observation: 'committed' } });
});
it.each(['cancelled', 'blocked'] as const)('a %s retained preview cannot later be promoted into a completed action', event => {
    const f = fixture(); f.retaining(true); const trace = f.review(); trace[event](); trace.submitted(); trace.complete({ state: 'replayed', revision: 1 });
    expect(f.read()).toMatchObject({ stage: event, fact: settingsObservation('profile-edit', event) }); expect(f.ports.update).toHaveBeenCalledOnce();
});
it('unexpected service failure preserves the last observed history fact without inventing a submission', () => {
    const f = fixture(); f.retaining(true); const trace = f.review(); trace.confirming(); trace.complete({ state: 'unknown', acknowledgement: 'unknown', observation: 'unavailable', observedRevision: null });
    expect(f.read()).toMatchObject({ stage: 'unknown', fact: { phase: 'reviewed', acknowledgement: 'not-submitted' } }); expect(f.ports.update).not.toHaveBeenCalled();
});
it('retention faults never change current canonical completion and never cause fresh admission or retries', () => {
    const f = fixture(); f.retaining(true); const trace = f.review(); f.ports.update.mockImplementation(() => { throw new Error('private'); });
    trace.submitted(); trace.complete({ state: 'committed', revision: 1, acknowledgement: 'unknown', current: true }); f.ports.retention.mockImplementation(() => { throw new Error('private'); });
    expect(f.read()).toMatchObject({ stage: 'settled', retention: 'unknown', fact: { observation: 'committed' } }); expect(f.ports.admit).toHaveBeenCalledOnce();
});
it('failed history admission and notification still expose current completion without retries', () => {
    const f = fixture(); f.ports.admit.mockImplementation(() => { throw new Error('private'); }); f.ports.changed.mockImplementation(() => { throw new Error('private'); });
    const trace = f.review(); trace.complete({ state: 'replayed', revision: 1 }); expect(f.read()).toMatchObject({ stage: 'settled', retention: 'untracked' }); expect(f.ports.admit).toHaveBeenCalledOnce();
});
it('a new current preview retires the old private target while an older completion can update only its original history ticket', () => {
    const f = fixture(); f.retaining(true); const old = f.review(); const oldTicket = f.ports.admit.mock.results[0].value;
    f.operations.reviewSettings(CURRENT_OWNER, 'appearance', { location: { route: 'appearance' }, label: null }, f.current);
    old.submitted(); old.complete({ state: 'replayed', revision: 1 }); expect(f.read()).toMatchObject({ stage: 'reviewed', fact: { action: 'appearance' } });
    expect(f.ports.update.mock.lastCall![0]).toBe(oldTicket); expect(f.ports.admit).toHaveBeenCalledTimes(2);
});
it('observed source loss erases the target irreversibly, including after source recovery', () => {
    const f = fixture(); f.review(); f.current.mockReturnValue(false); expect(f.read()).toMatchObject({ sourceCurrent: false, target: null });
    f.current.mockReturnValue(true); expect(f.read()).toMatchObject({ sourceCurrent: true, target: null });
});
it.each([0, 301000])('clock rollback/expiry at %s removes private current state and a later callback cannot resurrect it', at => {
    const f = fixture(); const trace = f.review(); f.at(at); expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' });
    f.at(1001); trace.complete({ state: 'replayed', revision: 1 }); expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' });
});
it.each([NaN, Number.MAX_SAFE_INTEGER])('unsafe clock %s preserves primary independence and exposes no private entry', at => {
    const f = fixture(); f.review(); f.at(at); expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'unavailable' });
    expect(f.operations.reviewSettings(CURRENT_OWNER, 'appearance', CURRENT_TARGET, f.current)).toBeNull();
});
it('metadata reads and updates do not renew the five-minute lifetime', () => {
    const f = fixture(); const trace = f.review(); f.at(300999); trace.confirming(); expect(f.read().firstObserved).toBe(1000);
    f.at(301000); expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' });
});
it('bounds current entries to8 without touching another native source guard during pruning or eviction', () => {
    const f = fixture(); f.review(); const prior = f.current.mock.calls.length;
    for (let n = 1; n <= 8; n++) f.operations.reviewSettings(n.toString(16).padStart(32, '0'), 'appearance', CURRENT_TARGET, () => true);
    expect(f.current).toHaveBeenCalledTimes(prior); expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' });
});
it('reentrant retention reads cannot return a private target after replacement or disposal', () => {
    const f = fixture(); f.retaining(true); f.review(); f.ports.retention.mockImplementationOnce(() => { f.operations.invalidate(); return 'stored'; });
    expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' }); f.review(); f.ports.retention.mockImplementationOnce(() => { f.operations.stop(); return 'stored'; });
    expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' });
});
it('reentrant admission cannot overwrite a newer current entry or publish it as the earlier operation', () => {
    const f = fixture(); f.ports.admit.mockImplementationOnce(() => { f.operations.reviewSettings(CURRENT_OWNER, 'appearance', { location: { route: 'appearance' }, label: null }, f.current); return null; });
    const old = f.review(); old.complete({ state: 'replayed', revision: 1 }); expect(f.read().fact.action).toBe('appearance');
});
it('invalid owners, actions, targets and denied sources acquire no history ticket', () => {
    const f = fixture(); expect(f.operations.reviewSettings('wrong', 'appearance', CURRENT_TARGET, f.current)).toBeNull();
    expect(f.operations.reviewSettings(CURRENT_OWNER, 'connect-read' as never, CURRENT_TARGET, f.current)).toBeNull();
    expect(f.operations.reviewSettings(CURRENT_OWNER, 'appearance', { ...CURRENT_TARGET, label: '' }, f.current)).toBeNull();
    f.current.mockReturnValue(false); expect(f.operations.reviewSettings(CURRENT_OWNER, 'appearance', CURRENT_TARGET, f.current)).toBeNull(); expect(f.ports.admit).not.toHaveBeenCalled();
});
it('shutdown forgets every current target and ignores all later callbacks', () => {
    const f = fixture(); const trace = f.review(); f.operations.stop(); const notifications = f.ports.changed.mock.calls.length;
    trace.submitted(); trace.complete({ state: 'replayed', revision: 1 }); expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'unavailable' });
    expect(f.operations.reviewSettings(CURRENT_OWNER, 'appearance', CURRENT_TARGET, f.current)).toBeNull(); expect(f.ports.changed).toHaveBeenCalledTimes(notifications);
});
it('collection becoming available after a preview cannot retrospectively acquire a ticket for that preview', () => {
    const f = fixture(); const trace = f.review(); f.retaining(true); trace.submitted(); trace.complete({ state: 'replayed', revision: 1 });
    expect(f.ports.admit).toHaveBeenCalledOnce(); expect(f.ports.update).not.toHaveBeenCalled(); expect(f.read().retention).toBe('untracked');
});
it('target and public snapshots are detached and frozen without freezing the caller-owned target', () => {
    const f = fixture(); const target = structuredClone(CURRENT_TARGET); f.operations.reviewSettings(CURRENT_OWNER, 'profile-edit', target, f.current);
    target.label = 'Changed after capture'; target.location.detail = 'other'; const value = f.read(); expect(value.target).toEqual(CURRENT_TARGET);
    expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value.target)).toBe(true); expect(Object.isFrozen(target)).toBe(false);
});
it('clock and source exceptions erase private state without affecting later caller outcomes', () => {
    const f = fixture(); const trace = f.review(); f.current.mockImplementation(() => { throw new Error('private'); });
    expect(f.read()).toMatchObject({ target: null, sourceCurrent: false }); f.ports.now.mockImplementation(() => { throw new Error('private'); });
    expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'unavailable' }); expect(() => trace.complete({ state: 'replayed', revision: 1 })).not.toThrow();
});
it('source movement while detaching the target cannot acquire current state or history authority', () => {
    const f = fixture(); f.current.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(f.operations.reviewSettings(CURRENT_OWNER, 'appearance', CURRENT_TARGET, f.current)).toBeNull(); expect(f.ports.admit).not.toHaveBeenCalled();
});
it('retention reentry cannot extend an entry beyond its original lifetime', () => {
    const f = fixture(); f.retaining(true); f.review(); f.ports.retention.mockImplementationOnce(() => { f.at(301000); return 'stored'; });
    expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' });
});
it('a later source check that replaces the current entry cannot leak an earlier private response', () => {
    const f = fixture(); f.review(); f.current.mockReturnValueOnce(true).mockImplementationOnce(() => { f.operations.invalidate(); return true; });
    expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' });
});
it('malformed retention status is contained as unknown rather than being copied into public facts', () => {
    const f = fixture(); f.retaining(true); f.review(); f.ports.retention.mockReturnValueOnce('private' as never);
    expect(f.read().retention).toBe('unknown');
});
it.each(['admission', 'target-copy'])('disposal during %s cannot mint a trace or attempt history admission', boundary => {
    const f = fixture(); const stop = () => { f.operations.stop(); return true; };
    const target = boundary === 'target-copy' ? { toJSON() { f.current.mockImplementation(stop); return CURRENT_TARGET; } } : CURRENT_TARGET;
    if (boundary === 'admission') f.current.mockImplementation(stop);
    expect(f.operations.reviewSettings(CURRENT_OWNER, 'profile-edit', target as never, f.current)).toBeNull(); expect(f.ports.admit).not.toHaveBeenCalled();
});
it.each(['admission', 'target-copy'])('source invalidation during %s cannot be mistaken for a fresh current capture', boundary => {
    const f = fixture(); const retire = () => { f.operations.invalidate(); return true; };
    const target = boundary === 'target-copy' ? { toJSON() { f.current.mockImplementation(retire); return CURRENT_TARGET; } } : CURRENT_TARGET;
    if (boundary === 'admission') f.current.mockImplementation(retire);
    expect(f.operations.reviewSettings(CURRENT_OWNER, 'profile-edit', target as never, f.current)).toBeNull(); expect(f.ports.admit).not.toHaveBeenCalled();
});
it('capture expiry or lost source before an observer update erases the target without creating a new current record', () => {
    const f = fixture(); const trace = f.review(); f.at(301000); trace.confirming(); expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' });
    const other = fixture(); const alive = other.review(); other.current.mockReturnValue(false); alive.confirming(); expect(other.read().target).toBeNull();
});
it('cancellation after an observed store attempt cannot fabricate an unsubmitted operation', () => {
    const f = fixture(); const trace = f.review(); trace.submitted(); trace.cancelled(); trace.blocked(); expect(f.read().stage).toBe('submitted');
});
it('once confirmation has begun, cancelling or retiring the preview cannot assert that the write was never attempted', () => {
    const f = fixture(); const trace = f.review(); trace.confirming(); trace.cancelled(); trace.blocked(); expect(f.read().stage).toBe('confirming');
});
it('a retained-status callback that loses the clock or stops at the final source fence cannot expose the old target', () => {
    const f = fixture(); f.retaining(true); f.review(); f.ports.retention.mockImplementationOnce(() => { f.ports.now.mockReturnValue(NaN); return 'stored'; });
    expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'unavailable' });
    const other = fixture(); other.review(); other.current.mockReturnValueOnce(true).mockImplementationOnce(() => { other.operations.stop(); return true; });
    expect(other.operations.read(CURRENT_OWNER)).toEqual({ state: 'empty' });
});
it('disposal during history admission cannot publish or revive the current target', () => {
    const f = fixture(); f.ports.admit.mockImplementationOnce(() => { f.operations.stop(); return null; }); f.review(); expect(f.operations.read(CURRENT_OWNER)).toEqual({ state: 'unavailable' });
});
it('a delayed submission callback cannot downgrade an already observed uncertain settlement', () => {
    const f = fixture(); f.retaining(true); const trace = f.review();
    trace.complete({ state: 'unknown', acknowledgement: 'accepted', observedRevision: null, observation: 'unavailable' }); trace.submitted();
    expect(f.read()).toMatchObject({ stage: 'unknown', fact: { phase: 'settled', acknowledgement: 'accepted', observation: 'unavailable' } });
    expect(f.ports.update).toHaveBeenCalledOnce();
});
