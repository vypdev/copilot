import { expect, it, vi } from 'vitest';
import { TemporaryPauseGateway } from '../../src/application/temporary_pause_gateway.ts';
import type { PauseTabList } from '../../src/domain/temporary_pause_controls.ts';
import { pauseReviewsFixture } from '../fixtures/temporary_pause_reviews.ts';
import { CENTER_BINDING, CENTER_SENDER } from '../fixtures/center.ts';
import { deferred } from '../fixtures/runtime.ts';

function fixture() {
    const h = pauseReviewsFixture(); const targets = { list: vi.fn(async (): Promise<PauseTabList> => ({ state: 'ready', tabs: [], limited: false })) };
    const gateway = new TemporaryPauseGateway(h.center.controller, h.store, h.reviews, targets);
    const read = () => gateway.handle({ version: 1, method: 'center.pauses.read', clientId: h.owner.clientId }, h.owner, CENTER_BINDING);
    return { ...h, targets, read };
}
it('a center composition without native controls fails closed rather than exposing a substitute store', async () => {
    const h = fixture(); expect(await h.center.gateway.handle({ version: 1, method: 'center.pauses.read', clientId: h.owner.clientId }, CENTER_SENDER)).toEqual({ state: 'unavailable' });
    expect(h.port.get).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it('a retired native identity cannot begin a protected pause read', async () => {
    const h = fixture(); h.center.controller.releaseTab(1);
    expect(await h.read()).toEqual({ state: 'stale' }); expect(h.port.get).not.toHaveBeenCalled(); expect(h.targets.list).not.toHaveBeenCalled();
});
it('source loss while reading the protected document prevents even the tab-choice lookup', async () => {
    const h = fixture(); const pending = deferred<unknown>(); vi.mocked(h.port.get).mockReturnValueOnce(pending.promise);
    const reading = h.read(); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled()); h.center.controller.releaseTab(1); pending.resolve(h.before);
    expect(await reading).toEqual({ state: 'stale' }); expect(h.targets.list).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it('source loss during native choices discards an otherwise completed metadata reply', async () => {
    const h = fixture(); const pending = deferred<PauseTabList>(); h.targets.list.mockReturnValueOnce(pending.promise);
    const reading = h.read(); await vi.waitFor(() => expect(h.targets.list).toHaveBeenCalled()); h.center.controller.releaseTab(1);
    pending.resolve({ state: 'ready', tabs: [{ tabId: 7, label: null }], limited: false });
    expect(await reading).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
