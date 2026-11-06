import { expect, it } from 'vitest';
import { pauseClientFixture as fixture } from '../fixtures/pause_client.ts';
import { pausePlanWire } from '../fixtures/pause_wire.ts';
import { deferred } from '../fixtures/runtime.ts';
const intent = { type: 'emergency', paused: true } as const;
it('existing reviews, pending requests and stopped clients cannot acquire another preview', async () => {
    const h = fixture(); const gate = deferred<unknown>(); h.ports.request.mockReturnValueOnce(gate.promise); const pending = h.client.reviews.preview(intent, 0);
    await h.client.reviews.preview(intent, 0); expect(h.ports.request).toHaveBeenCalledOnce(); gate.resolve(pausePlanWire()); await pending;
    await h.client.reviews.preview(intent, 0); expect(h.ports.request).toHaveBeenCalledOnce(); h.client.stop(); await h.client.reviews.preview(intent, 0);
    h.client.contextChanged(); h.client.reviews.retire(); h.client.reviews.invalidateTab(7); expect(h.ports.request).toHaveBeenCalledOnce(); expect(h.client.view.review).toBeNull();
});
it('invalid target IDs cannot retire an otherwise current native tab review', async () => {
    const h = fixture(); await h.client.reviews.preview({ type: 'tab', tabId: 7, paused: true }, 0); h.client.reviews.invalidateTab(-1);
    expect(h.client.view.review?.phase).toBe('preview'); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('stopping from the primary-result renderer prevents follow-up metadata and preserves the actual native effect', async () => {
    const h = fixture(); await h.client.reviews.preview(intent, 0); h.client.subscribe(view => { if (view.review?.outcome?.state === 'committed') h.client.stop(); });
    await h.client.reviews.confirm(); expect(h.native.port.set).toHaveBeenCalledOnce(); expect(h.client.view.review).toBeNull();
    expect(h.ports.request.mock.calls.some(([input]) => input.method === 'center.pauses.read')).toBe(false);
});
