import { expect, it, vi } from 'vitest';
import { PauseObservations } from '../../src/application/pause_observations.ts';
import { completePause, reportPause } from '../../src/application/pause_observation_ports.ts';
import { validPauseFact } from '../../src/domain/pause_fact.ts';

const committed = { state: 'committed', revision: 1, acknowledgement: 'accepted', current: true } as const;
const unknown = { state: 'unknown', acknowledgement: 'unknown', observation: 'unavailable', observedRevision: null, current: false } as const;
function fixture(action: ConstructorParameters<typeof PauseObservations>[0] = 'pause-tab') {
    const changed = vi.fn(); const observer = new PauseObservations(action, changed); return { observer, changed };
}
it('intent, confirmation, native submission, acknowledgement, canonical observation and response remain separate', () => {
    const { observer, changed } = fixture(); expect(observer.fact).toMatchObject({ state: 'reviewed', submitted: false }); observer.confirming();
    expect(observer.fact).toMatchObject({ state: 'running', acknowledgement: 'not-observed' }); observer.submitted();
    expect(observer.fact).toMatchObject({ submitted: true, acknowledgement: 'unknown', observation: 'not-observed' }); observer.acknowledged('accepted');
    expect(observer.fact).toMatchObject({ acknowledgement: 'accepted', observation: 'not-observed', sourceCurrentAtObservation: null });
    observer.settled({ acknowledgement: 'accepted', observation: 'committed' }); expect(observer.fact).toMatchObject({ result: 'pending', observation: 'committed' });
    observer.complete(committed); expect(observer.fact).toMatchObject({ state: 'settled', result: 'committed', sourceCurrentAtObservation: true, incomplete: false });
    expect(changed.mock.calls.every(([value]) => validPauseFact(value) && Object.isFrozen(value))).toBe(true);
});
it('a cancelled preview cannot later manufacture an attempt or completion', () => {
    const { observer, changed } = fixture(); observer.cancelled(); const fact = observer.fact; observer.confirming(); observer.submitted(); observer.acknowledged('accepted');
    observer.settled({ acknowledgement: 'accepted', observation: 'committed' }); observer.complete(committed); observer.cancelled();
    expect(observer.fact).toBe(fact); expect(changed).toHaveBeenCalledTimes(1);
});
it('cancel after a real submission cannot undo or relabel the accepted effect', () => {
    const { observer } = fixture(); observer.confirming(); observer.submitted(); observer.cancelled(); observer.complete(committed);
    expect(observer.fact).toMatchObject({ result: 'committed', submitted: true });
});
it('repeated progress and confirmations cannot rewrite a terminal operation', () => {
    const { observer, changed } = fixture(); observer.confirming(); observer.confirming(); observer.submitted(); observer.submitted(); observer.complete(committed);
    const count = changed.mock.calls.length; observer.complete(unknown); observer.confirming(); observer.submitted(); observer.acknowledged('unknown');
    expect(changed).toHaveBeenCalledTimes(count); expect(observer.fact.result).toBe('committed');
});
it('a lost final response preserves independently proved accepted and canonical facts without certifying that response', () => {
    const { observer } = fixture(); observer.confirming(); observer.submitted(); observer.acknowledged('accepted');
    observer.settled({ acknowledgement: 'accepted', observation: 'committed' }); observer.acknowledged('unknown');
    observer.settled({ acknowledgement: 'unknown', observation: 'unavailable' }); observer.complete(unknown);
    expect(observer.fact).toMatchObject({ state: 'settled', result: 'unknown', acknowledgement: 'accepted', observation: 'committed', sourceCurrentAtObservation: false });
});
it.each(['different', 'unavailable'] as const)('a %s canonical read cannot be promoted to the desired record', observation => {
    const { observer } = fixture(); observer.confirming(); observer.submitted(); observer.settled({ acknowledgement: 'unknown', observation });
    observer.complete({ ...unknown, observation }); expect(observer.fact).toMatchObject({ result: 'unknown', acknowledgement: 'unknown', observation });
});
it('explicit adoption is a completed observation with no invented native submission or acknowledgement', () => {
    const { observer } = fixture('adopt-pauses'); observer.confirming(); observer.submitted(); observer.acknowledged('accepted'); observer.settled({ acknowledgement: 'accepted', observation: 'committed' });
    observer.complete({ state: 'reconciled', revision: 8, current: false }); expect(observer.fact).toMatchObject({ result: 'reconciled', submitted: false,
        acknowledgement: 'not-observed', observation: 'adopted', sourceCurrentAtObservation: false });
});
it('missing native events are disclosed rather than backfilled from a completion', () => {
    const { observer } = fixture(); observer.complete(committed);
    expect(observer.fact).toMatchObject({ result: 'committed', submitted: false, incomplete: true });
    const other = fixture().observer; other.confirming(); other.acknowledged('accepted'); other.settled({ acknowledgement: 'accepted', observation: 'committed' }); other.complete(committed);
    expect(other.fact).toMatchObject({ submitted: false, incomplete: true });
});
it.each(['invalid', 'conflict', 'stale', 'unavailable', 'future', 'corrupt', 'busy', 'unchanged'] as const)('a %s pre-attempt outcome preserves absent native facts', state => {
    const { observer } = fixture(); observer.confirming(); observer.complete({ state });
    expect(observer.fact).toMatchObject({ state: 'settled', result: state, submitted: false, acknowledgement: 'not-observed', observation: 'not-observed', sourceCurrentAtObservation: null });
});
it('an interrupted native operation can disclose an unavailable result with its prior accepted acknowledgement', () => {
    const { observer } = fixture(); observer.confirming(); observer.submitted(); observer.acknowledged('accepted'); observer.complete({ state: 'unavailable' });
    expect(observer.fact).toMatchObject({ result: 'unavailable', acknowledgement: 'accepted', incomplete: true, sourceCurrentAtObservation: null });
});
it('unsubmitted, denied and expired inspection replies are not native completions', () => {
    const { observer, changed } = fixture(); observer.confirming(); const count = changed.mock.calls.length;
    for (const state of ['pending', 'not-submitted', 'denied', 'expired'] as const) observer.complete({ state });
    expect(changed).toHaveBeenCalledTimes(count); expect(observer.fact.state).toBe('running');
});
it('a cancelled retained reply can retire an unsubmitted observer without fabricating a settled write', () => {
    const { observer } = fixture(); observer.complete({ state: 'cancelled' }); expect(observer.fact).toMatchObject({ state: 'cancelled', result: 'cancelled', submitted: false });
});
it('secondary sink failures cannot erase proved events or escape into the primary writer', () => {
    const { observer, changed } = fixture(); changed.mockImplementation(() => { throw new Error('secondary sink failed'); });
    reportPause(observer, 'confirming'); observer.submitted(); completePause(observer, committed); expect(observer.fact.result).toBe('committed');
    reportPause(null, 'confirming'); completePause(undefined, committed);
});
it('a throwing observation boundary is isolated and receives a detached immutable primary result', () => {
    const h = fixture(); const result = { ...committed }; const seen: unknown[] = [];
    const trace = { ...h.observer, confirming: () => { throw new Error('boundary'); }, cancelled: vi.fn(), submitted: vi.fn(), acknowledged: vi.fn(), settled: vi.fn(),
        complete: (value: unknown) => { seen.push(value); throw new Error('sink'); } };
    reportPause(trace, 'confirming'); completePause(trace, result); expect(seen[0]).toEqual(result); expect(seen[0]).not.toBe(result); expect(Object.isFrozen(seen[0])).toBe(true); expect(Object.isFrozen(result)).toBe(false);
});
