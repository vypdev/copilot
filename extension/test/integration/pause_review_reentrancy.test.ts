import { expect, it } from 'vitest';
import { PauseReviewClient } from '../../src/application/pause_review_client.ts';
import { pauseClientFixture } from '../fixtures/pause_client.ts';
const intent = { type: 'emergency', paused: true } as const;
it('a renderer that retires a preview before dispatch cannot send obsolete native work', async () => {
    const h = pauseClientFixture(); const reviews = new PauseReviewClient(h.ports, () => undefined);
    h.ports.changed.mockImplementationOnce(() => reviews.retire()); await reviews.preview(intent, 0);
    expect(h.ports.request).not.toHaveBeenCalled(); expect(reviews.view.busy).toBe(false);
});
it.each(['retire', 'stop'] as const)('a %s during confirmation notification cannot dispatch a retired native write', async event => {
    const h = pauseClientFixture(); const reviews = new PauseReviewClient(h.ports, () => undefined); await reviews.preview(intent, 0); h.ports.request.mockClear();
    h.ports.changed.mockImplementationOnce(() => reviews[event]()); await reviews.confirm();
    expect(h.ports.request).not.toHaveBeenCalled(); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('policy loss during the confirmation notification cannot submit a now unauthorized native effect', async () => {
    const h = pauseClientFixture(); const reviews = new PauseReviewClient(h.ports, () => undefined); await reviews.preview(intent, 0); h.ports.request.mockClear();
    h.ports.changed.mockImplementationOnce(() => h.allowMutation(false)); await reviews.confirm();
    expect(h.ports.request).not.toHaveBeenCalled(); expect(h.native.port.set).not.toHaveBeenCalled(); expect(reviews.view.review?.phase).toBe('stale');
});
it('stopping while announcing exact-result inspection prevents sending the private retained selectors', async () => {
    const h = pauseClientFixture(); const reviews = new PauseReviewClient(h.ports, () => undefined); await reviews.preview(intent, 0);
    h.ports.request.mockResolvedValueOnce(null); await reviews.confirm(); h.ports.request.mockClear(); h.ports.changed.mockImplementationOnce(() => reviews.stop()); await reviews.inspect();
    expect(h.ports.request).not.toHaveBeenCalled();
});
