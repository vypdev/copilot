import { expect, it, vi } from 'vitest';
import { SessionObservationSource } from '../../src/application/session_observation_source.ts';

const fixture = () => { const query = vi.fn(() => ({ controllerEpoch: 1, credentialEpoch: 2 }) as { controllerEpoch: number; credentialEpoch: number } | null); return { query, source: new SessionObservationSource(query) }; };
it('captures a detached native fence and observes it without publishing selectors or renewable authority', () => {
    const f = fixture(); expect(f.source.current()).toBe(true); expect(f.query).toHaveBeenCalledTimes(2);
    const value = { controllerEpoch: 1, credentialEpoch: 2 }; const source = new SessionObservationSource(() => value); value.credentialEpoch = 3; expect(source.current()).toBe(false);
});
it('only an exact own native epoch advance preserves current source', () => {
    const f = fixture(); f.query.mockReturnValue({ controllerEpoch: 1, credentialEpoch: 3 }); f.source.advance(2, 3); expect(f.source.current()).toBe(true);
    f.query.mockReturnValue({ controllerEpoch: 1, credentialEpoch: 4 }); f.source.advance(3, 4); expect(f.source.current()).toBe(true);
});
it.each(['controller', 'credential', 'removed', 'failure'])('an unrelated %s transition retires a source irreversibly', boundary => {
    const f = fixture(); if (boundary === 'failure') f.query.mockImplementationOnce(() => { throw new Error('private'); });
    else f.query.mockReturnValueOnce(boundary === 'removed' ? null : { controllerEpoch: boundary === 'controller' ? 2 : 1, credentialEpoch: boundary === 'credential' ? 3 : 2 });
    expect(f.source.current()).toBe(false); f.query.mockReturnValue({ controllerEpoch: 1, credentialEpoch: 2 }); f.source.advance(2, 3); expect(f.source.current()).toBe(false);
});
it.each([[1, 3], [2, 4], [-1, 0], [2, NaN], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]])('invalid own epoch proof %s → %s never renews a source', (previous, next) => {
    const f = fixture(); f.query.mockReturnValue({ controllerEpoch: 1, credentialEpoch: next }); f.source.advance(previous, next); expect(f.source.current()).toBe(false);
});
it('an epoch advance cannot bridge a controller takeover or a missing native lease', () => {
    const f = fixture(); f.query.mockReturnValue({ controllerEpoch: 2, credentialEpoch: 3 }); f.source.advance(2, 3); expect(f.source.current()).toBe(false);
    const other = fixture(); other.query.mockReturnValue(null); other.source.advance(2, 3); expect(other.source.current()).toBe(false);
});
it('invalid initial native metadata stays inert even if later facts look healthy', () => {
    for (const value of [null, { controllerEpoch: -1, credentialEpoch: 2 }, { controllerEpoch: 1, credentialEpoch: NaN }]) {
        const query = vi.fn(() => value); const source = new SessionObservationSource(query); expect(source.current()).toBe(false); expect(query).toHaveBeenCalledOnce();
    }
});
it('a failed initial query cannot acquire a source or leak its exception', () => {
    const source = new SessionObservationSource(() => { throw new Error('private'); }); expect(source.current()).toBe(false);
});
it('reentrant retirement during a final query cannot restore the old source', () => {
    const f = fixture(); f.query.mockImplementationOnce(() => { f.source.retire(); return { controllerEpoch: 1, credentialEpoch: 2 }; }); expect(f.source.current()).toBe(false);
    const other = fixture(); other.query.mockImplementationOnce(() => { other.source.retire(); return { controllerEpoch: 1, credentialEpoch: 3 }; }); other.source.advance(2, 3); expect(other.source.current()).toBe(false);
});
it('explicit retirement prevents subsequent query or advance activity', () => {
    const f = fixture(); f.source.retire(); f.source.advance(2, 3); expect(f.source.current()).toBe(false); expect(f.query).toHaveBeenCalledOnce();
});
