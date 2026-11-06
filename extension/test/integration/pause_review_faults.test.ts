import { expect, it } from 'vitest';
import { PauseReviewClient } from '../../src/application/pause_review_client.ts';
import { pauseClientFixture as fixture } from '../fixtures/pause_client.ts';
import { pausePlanWire, pauseControlWire } from '../fixtures/pause_wire.ts';
import { deferred } from '../fixtures/runtime.ts';
const intent = { type: 'emergency', paused: true } as const;
it.each(['invalid-input', 'capacity', 'overflow'] as const)('a closed preview refusal %s remains a separate issue without a review', async reason => {
    const h = fixture(); h.ports.request.mockResolvedValue({ state: 'invalid', reason }); await h.client.reviews.preview(intent, 0);
    expect(h.client.view.issue).toBe(reason === 'invalid-input' ? 'invalid' : reason); expect(h.client.view.review).toBeNull();
});
it.each(['busy', 'unchanged', 'expired', 'precaution', 'conflict', 'future', 'corrupt', 'stale', 'unavailable', 'denied'] as const)('a %s preview refusal cannot become an authorizing retained plan', async state => {
    const h = fixture(); h.ports.request.mockResolvedValue({ state }); await h.client.reviews.preview(intent, 0); expect(h.client.view.issue).toBe(state); expect(h.client.view.review).toBeNull();
});
it.each(['rejected', 'expired', 'invalid-clock', 'unavailable-clock', 'wrong-action'] as const)('a %s preview never grants a usable confirmation', async fault => {
    const h = fixture(); h.ports.request.mockResolvedValue(pausePlanWire());
    if (fault === 'rejected') h.ports.request.mockRejectedValue(new Error('private transport'));
    if (fault === 'expired') h.at(301000); if (fault === 'invalid-clock') h.at(NaN);
    if (fault === 'unavailable-clock') h.ports.now.mockImplementation(() => { throw new Error('clock'); });
    if (fault === 'wrong-action') h.ports.request.mockResolvedValue(pausePlanWire('adopt-observed'));
    await h.client.reviews.preview(intent, 0); expect(h.client.view.review).toBeNull(); expect(h.client.view.busy).toBe(false);
    expect(h.client.view.issue).toBe(fault === 'expired' ? 'expired' : 'unavailable'); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('a throwing authorization policy fails closed before any native request', async () => {
    const h = fixture(); h.ports.canMutate.mockImplementation(() => { throw new Error('policy'); }); await h.client.reviews.preview(intent, 0); expect(h.client.view.issue).toBe('denied'); expect(h.ports.request).not.toHaveBeenCalled();
});
it('policy invalidated by preview notification prevents dispatch even when identity has not changed', async () => {
    const h = fixture(); const reviews = new PauseReviewClient(h.ports, () => undefined); h.ports.changed.mockImplementationOnce(() => h.allowMutation(false));
    await reviews.preview(intent, 0); expect(reviews.view.issue).toBe('denied'); expect(h.ports.request).not.toHaveBeenCalled();
});
it('throwing renderers and follow-up observation callbacks cannot erase factual native completion', async () => {
    const h = fixture(); const reviews = new PauseReviewClient(h.ports, () => { throw new Error('metadata'); });
    h.ports.changed.mockImplementation(() => { throw new Error('renderer'); }); await reviews.preview(intent, 0); await reviews.confirm(); expect(reviews.view.review?.outcome?.state).toBe('committed'); expect(h.native.port.set).toHaveBeenCalledOnce();
});
it('an ordinary denied completion retires the review and cannot be automatically retried', async () => {
    const h = fixture(); await h.client.reviews.preview(intent, 0); h.ports.request.mockResolvedValueOnce({ state: 'denied' }); await h.client.reviews.confirm(); await h.client.reviews.confirm();
    expect(h.client.view.review).toMatchObject({ phase: 'stale', plan: null, outcome: { state: 'denied' } }); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('a committed reply with a wrong revision remains unknown until exact retained inspection proves completion', async () => {
    const h = fixture(); await h.client.reviews.preview(intent, 0); h.ports.request.mockResolvedValueOnce({ state: 'committed', revision: 9, acknowledgement: 'accepted', current: true });
    await h.client.reviews.confirm(); expect(h.client.view.review).toMatchObject({ phase: 'unknown', outcome: null }); expect(h.client.view.issue).toBe('unavailable');
});
it('a pending confirmation stays busy across a not-submitted or unavailable inspection and settles only on a stronger exact result', async () => {
    const h = fixture(); await h.client.reviews.preview(intent, 0); h.ports.request.mockResolvedValueOnce({ state: 'pending' }); await h.client.reviews.confirm();
    expect(h.client.view.busy).toBe(true); expect(await h.client.reviews.dismiss()).toBe(false);
    h.ports.request.mockResolvedValueOnce({ state: 'not-submitted' }); await h.client.reviews.inspect(); expect(h.client.view.busy).toBe(true);
    h.ports.request.mockResolvedValueOnce(null); await h.client.reviews.inspect(); expect(h.client.view.busy).toBe(true);
    h.ports.request.mockResolvedValueOnce({ state: 'cancelled' }); await h.client.reviews.inspect(); expect(h.client.view.busy).toBe(false); expect(h.client.view.review?.outcome?.state).toBe('cancelled');
});
it('a previously observed uncertainty survives a missing inspection without reissuing its confirmation', async () => {
    const h = fixture(); await h.client.reviews.preview(intent, 0); h.ports.request.mockResolvedValueOnce({ state: 'unknown', acknowledgement: 'unknown', observation: 'unavailable', observedRevision: null, current: true });
    await h.client.reviews.confirm(); h.ports.request.mockResolvedValueOnce(null); await h.client.reviews.inspect(); expect(h.client.view.review?.outcome?.state).toBe('unknown'); expect(h.client.view.issue).toBe('unavailable');
});
it('canonical precaution changes, unreadable state and lost positive targets expire only unsubmitted reviews', async () => {
    for (const patch of [{ precaution: true }, { loaded: { state: 'future' as const } }, { targets: { state: 'unavailable' as const } }, { targets: { state: 'ready' as const, tabs: [], limited: false } }]) {
        const h = fixture(); await h.client.reviews.preview({ type: 'tab', tabId: 7, paused: true }, 0); h.ports.request.mockResolvedValueOnce({ ...pauseControlWire(), ...patch }); await h.client.reader.read();
        expect(h.client.view.review?.phase).toBe('stale'); expect(h.native.port.set).not.toHaveBeenCalled();
    }
});
it('fifteen obsolete previews, one current confirmation and one exact inspection stay bounded at seventeen pending calls', async () => {
    const h = fixture(); const gate = deferred<unknown>(); let previews = 0;
    h.ports.request.mockImplementation(input => input.method === 'center.pauses.preview' && ++previews === 16 ? Promise.resolve(pausePlanWire()) : gate.promise);
    const old: Promise<void>[] = [];
    for (let i = 0; i < 15; i++) { old.push(h.client.reviews.preview(intent, 0)); h.client.contextChanged(); }
    await h.client.reviews.preview(intent, 0); const confirmation = h.client.reviews.confirm(); const inspection = h.client.reviews.inspect(); await h.client.reviews.inspect();
    expect(h.ports.request).toHaveBeenCalledTimes(18); // Sixteen previews, one confirmation and one inspection; fifteen previews remain pending.
    h.client.contextChanged(); await h.client.reviews.dismiss(); await h.client.reviews.preview(intent, 0); expect(h.client.view.issue).toBe('busy'); expect(h.ports.request).toHaveBeenCalledTimes(18);
    gate.resolve(null); await Promise.all([...old, confirmation, inspection]); expect(h.client.view.review).toBeNull();
});
it('a missing cancellation delivery cannot be dismissed while the owned cancellation still reports pending', async () => {
    const h = fixture(); await h.client.reviews.preview(intent, 0); h.ports.request.mockResolvedValueOnce({ state: 'pending' }); expect(await h.client.reviews.dismiss()).toBe(false);
    expect(h.client.view.busy).toBe(true); expect(h.native.port.set).not.toHaveBeenCalled();
});
