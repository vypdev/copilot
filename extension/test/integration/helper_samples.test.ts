import { expect, it } from 'vitest';
import { helperSamplesFixture as fixture, helperIntent } from '../fixtures/helper_samples.ts';
import { decodeHelperSample } from '../../src/domain/helper_sample_view.ts';

it('construction and a legacy open create no source sample, history admission or fabricated healthy result', () => {
    const f = fixture(); expect(f.ports.now).not.toHaveBeenCalled(); expect(f.owner.capture(undefined, f.source)).toBeNull();
    expect(f.owner.read(1)).toEqual({ state: 'empty' }); expect(f.ports.admit).not.toHaveBeenCalled(); expect(f.ports.changed).not.toHaveBeenCalled();
});
it('capture is historical, private and bound only after a native created-tab result', () => {
    const f = fixture(); const receipt = f.capture(); expect(f.owner.read(1)).toEqual({ state: 'empty' }); expect(f.owner.attach(receipt, 1)).toBe(true);
    expect(f.owner.read(1)).toMatchObject({ state: 'sample', capturedAt: 1000, health: helperIntent().health }); expect(f.owner.read(2)).toEqual({ state: 'empty' });
    expect(Object.keys(receipt)).toHaveLength(0); expect(JSON.stringify(f.owner.read(1))).not.toMatch(/sourceTree|generation|credentialEpoch|settingsRevision|tabId/);
});
it.each(['sourceTree', 'generation', 'credentialEpoch', 'settingsRevision'] as const)('a mismatched %s receipt cannot become ready or retain a reason', field => {
    const f = fixture(); const intent = { ...helperIntent(), [field]: field === 'sourceTree' ? 'b'.repeat(64) : 99 };
    const receipt = f.owner.capture(intent, f.source)!; f.owner.attach(receipt, 1); expect(f.owner.read(1)).toEqual({ state: 'unavailable' }); expect(f.ports.admit).not.toHaveBeenCalled();
});
it.each(['absent', 'retired', 'throwing', 'unavailable', 'malformed'] as const)('an %s source cannot be substituted with an empty healthy snapshot', state => {
    const f = fixture(); if (state === 'retired') f.current.mockReturnValue(false); if (state === 'throwing') f.current.mockImplementation(() => { throw new Error('private'); });
    const input = state === 'unavailable' ? { state: 'unavailable', sourceTree: f.source.sourceTree } : state === 'malformed' ? { ...helperIntent(), secret: 'private' } : helperIntent();
    const receipt = f.owner.capture(input, state === 'absent' ? null : f.source)!; expect(f.owner.attach(receipt, 1)).toBe(true);
    expect(f.owner.read(1)).toEqual({ state: 'unavailable' }); expect(f.ports.admit).not.toHaveBeenCalled();
});
it('an explicitly empty captured snapshot stays distinct from unavailable evidence', () => {
    const f = fixture(); const receipt = f.owner.capture({ ...helperIntent(), health: { blocked: [], events: [] } }, f.source)!;
    f.owner.attach(receipt, 1); expect(f.owner.read(1)).toEqual({ state: 'sample', capturedAt: 1000, health: { blocked: [], events: [] }, retention: [] }); expect(f.ports.admit).not.toHaveBeenCalled();
});
it('only the latest closed reason per helper is offered to diagnostics, never the entire ring or native source selectors', () => {
    const f = fixture(); f.retaining(true); f.owner.attach(f.capture(), 1);
    expect(f.ports.admit.mock.calls.map(([fact]) => fact)).toEqual([{ kind: 'helper', helper: 'runtime-health', code: 'cleanup-failed', scope: 'retired-at-observation' }, { kind: 'helper', helper: 'center-shortcuts', code: 'refresh-failed', scope: 'retired-at-observation' }]);
    expect(f.owner.read(1)).toMatchObject({ retention: [{ helper: 'runtime-health', retention: 'pending' }, { helper: 'center-shortcuts', retention: 'pending' }] });
});
it('off-at-capture remains untracked after opt-in and metadata reads cannot acquire another ticket', () => {
    const f = fixture(); const receipt = f.capture(); f.retaining(true); f.owner.attach(receipt, 1); f.owner.read(1); f.owner.read(1);
    expect(f.ports.admit).toHaveBeenCalledTimes(2); expect(f.ports.retention).not.toHaveBeenCalled(); expect(f.owner.read(1)).toMatchObject({ retention: [{ retention: 'untracked' }, { retention: 'untracked' }] });
});
it('source hiding after validated capture does not rewrite its historical reasons or cancel accepted static fact ownership', () => {
    const f = fixture(); f.retaining(true); const receipt = f.capture(); f.current.mockReturnValue(false); expect(f.owner.attach(receipt, 1)).toBe(true);
    expect(f.ports.admit.mock.calls.every(([, current]) => current())).toBe(true); expect(f.owner.read(1)).toMatchObject({ state: 'sample', health: helperIntent().health });
});
it('receipt replay cannot bind another native options window or repeat admission', () => {
    const f = fixture(); const receipt = f.capture(); expect(f.owner.attach(receipt, 1)).toBe(true); expect(f.owner.attach(receipt, 2)).toBe(false); expect(f.owner.attach({}, 2)).toBe(false);
    expect(f.owner.read(2)).toEqual({ state: 'empty' }); expect(f.ports.admit).toHaveBeenCalledTimes(2);
});
it.each([-1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('invalid native created-tab identity %s consumes rather than reuses the receipt', id => {
    const f = fixture(); const receipt = f.capture(); expect(f.owner.attach(receipt, id)).toBe(false); expect(f.owner.attach(receipt, 1)).toBe(false);
});
it('reads and source retirement do not renew the original five-minute lifetime', () => {
    const f = fixture(); f.retaining(true); f.owner.attach(f.capture(), 1); f.at(300999); expect(f.owner.read(1)).toMatchObject({ capturedAt: 1000 });
    f.at(301000); expect(f.owner.read(1)).toEqual({ state: 'empty' }); expect(f.ports.admit.mock.calls.every(([, current]) => !current())).toBe(true);
});
it.each(['clock-back', 'expired', 'invalid-clock'] as const)('an unbound %s capture cannot be installed later when the clock recovers', boundary => {
    const f = fixture(); const receipt = f.capture(); f.at(boundary === 'clock-back' ? 999 : boundary === 'expired' ? 301000 : Number.NaN);
    expect(f.owner.attach(receipt, 1)).toBe(false); f.at(1000); expect(f.owner.attach(receipt, 1)).toBe(false);
});
it('the eight-tab cap evicts the oldest installed sample without touching another source or retaining again', () => {
    const f = fixture(); f.retaining(true); const first = f.capture(); f.owner.attach(first, 1); const currents = f.ports.admit.mock.calls.map(([, current]) => current);
    for (let id = 2; id <= 9; id++) f.owner.attach(f.capture(), id);
    expect(f.owner.read(1)).toEqual({ state: 'empty' }); expect(f.owner.read(9).state).toBe('sample'); expect(currents.every(current => !current())).toBe(true);
});
it('native removal retires that tab and all unbound receipts without affecting other already installed observations', () => {
    const f = fixture(); f.owner.attach(f.capture(), 1); f.owner.attach(f.capture(), 2); const pending = f.capture(); f.owner.releaseTab(1);
    expect(f.owner.read(1)).toEqual({ state: 'empty' }); expect(f.owner.read(2).state).toBe('sample'); expect(f.owner.attach(pending, 3)).toBe(false);
});
it('replacement keeps only the new source snapshot and invalidates the old capture callbacks', () => {
    const f = fixture(); f.owner.attach(f.capture(), 1); const callbacks = f.ports.admit.mock.calls.map(([, current]) => current); f.at(2000); f.owner.attach(f.capture(), 1);
    expect(f.owner.read(1)).toMatchObject({ capturedAt: 2000 }); expect(callbacks.every(current => !current())).toBe(true);
});
it('secondary admission and notification failure preserve capture without reacquisition or leaked errors', () => {
    const f = fixture(); f.ports.admit.mockImplementation(() => { throw new Error('private'); }); f.ports.changed.mockImplementation(() => { throw new Error('private'); });
    expect(f.owner.attach(f.capture(), 1)).toBe(true); expect(f.owner.read(1).state).toBe('sample'); expect(f.ports.admit).toHaveBeenCalledTimes(2); expect(JSON.stringify(f.owner.read(1))).not.toContain('private');
});
it('unknown or failed retention remains separate from the complete source sample', () => {
    const f = fixture(); f.retaining(true); f.owner.attach(f.capture(), 1); f.ports.retention.mockReturnValueOnce('private' as never).mockImplementationOnce(() => { throw new Error('private'); });
    expect(f.owner.read(1)).toMatchObject({ state: 'sample', retention: [{ retention: 'unknown' }, { retention: 'unknown' }] }); expect(f.ports.admit).toHaveBeenCalledTimes(2);
});
it('shutdown from admission prevents another callback and the delayed receipt cannot publish any sample', () => {
    const f = fixture(); f.ports.admit.mockImplementationOnce(() => { f.owner.stop(); return null; }); const receipt = f.capture();
    expect(f.ports.admit).toHaveBeenCalledOnce(); expect(f.owner.attach(receipt, 1)).toBe(false); expect(f.owner.capture(helperIntent(), f.source)).toBeNull(); expect(f.owner.read(1)).toEqual({ state: 'unavailable' });
});
it('source validation and clock boundaries cannot reenter stop and still create an installable sample', () => {
    const f = fixture(); f.current.mockImplementation(() => { f.owner.stop(); return true; }); expect(f.owner.capture(helperIntent(), f.source)).toBeNull();
    const g = fixture(); g.ports.now.mockImplementation(() => { g.owner.stop(); return 1000; }); expect(g.capture()).toBeNull();
});
it('a clock failure during optional retention retires the incomplete capture instead of later returning an invalid wire view', () => {
    const f = fixture(); f.ports.admit.mockImplementationOnce(() => { f.at(Number.NaN); return {}; }); const receipt = f.capture();
    f.at(1000); expect(f.owner.attach(receipt, 1)).toBe(false); expect(f.owner.read(1)).toEqual({ state: 'empty' });
});
it('reentrant native removal from the last attach clock check cannot bind an uncertain identifier', () => {
    const f = fixture(); const receipt = f.capture(); f.ports.now.mockReturnValueOnce(1000).mockReturnValueOnce(1000).mockImplementationOnce(() => { f.owner.releaseTab(99); return 1000; });
    expect(f.owner.attach(receipt, 1)).toBe(false); expect(f.owner.read(1)).toEqual({ state: 'empty' });
});
it('reentrant replacement from retention inspection cannot republish the earlier sample', () => {
    const f = fixture(); f.retaining(true); f.owner.attach(f.capture(), 1); f.ports.retention.mockImplementationOnce(() => { f.owner.attach(f.capture(), 1); return 'stored'; });
    expect(f.owner.read(1)).toEqual({ state: 'empty' }); expect(f.owner.read(1).state).toBe('sample');
});
it('metadata snapshots remain immutable and satisfy their closed wire decoder without any source receipt', () => {
    const f = fixture(); f.owner.attach(f.capture(), 1); const read = f.owner.read(1); expect(decodeHelperSample(read)).toEqual(read); expect(Object.isFrozen(read)).toBe(true);
    if (read.state !== 'sample') throw new Error('missing sample'); expect(Object.isFrozen(read.health.events)).toBe(true); expect(Object.isFrozen(read.retention)).toBe(true);
    expect(decodeHelperSample({ ...read, tabId: 1 })).toBeNull(); expect(decodeHelperSample({ ...read, retention: [] })).toBeNull();
});

it('native options tab0 follows the existing center binding contract and is a valid private map key', () => {
    const f = fixture(); expect(f.owner.attach(f.capture(), 0)).toBe(true); expect(f.owner.read(0).state).toBe('sample');
});
it('shutdown reentered from retention inspection prevents querying another retired helper ticket', () => {
    const f = fixture(); f.retaining(true); f.owner.attach(f.capture(), 1); f.ports.retention.mockImplementationOnce(() => { f.owner.stop(); return 'stored'; });
    expect(f.owner.read(1)).toEqual({ state: 'empty' }); expect(f.ports.retention).toHaveBeenCalledOnce();
});
it('shutdown during the final clock inspection cannot return a previously looked-up sample', () => {
    const f = fixture(); f.owner.attach(f.capture(), 1); f.ports.now.mockReturnValueOnce(1000).mockImplementationOnce(() => { f.owner.stop(); return 1000; }); expect(f.owner.read(1)).toEqual({ state: 'empty' });
});
it('a throwing native clock retires earlier metadata and creates no new capture or guessed timestamp', () => {
    const f = fixture(); f.owner.attach(f.capture(), 1); const count = f.ports.admit.mock.calls.length; f.ports.now.mockImplementation(() => { throw new Error('private clock'); });
    expect(f.owner.read(1)).toEqual({ state: 'unavailable' }); expect(f.capture()).toBeNull(); expect(f.ports.admit).toHaveBeenCalledTimes(count); f.ports.now.mockReturnValue(1000); expect(f.owner.read(1)).toEqual({ state: 'empty' });
});
