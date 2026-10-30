// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { connectionActions } from '../../src/infrastructure/center_connections.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';

afterEach(() => { document.body.replaceChildren(); });
function fixture() {
    const browser = browserFixture(); const native = centerClientFixture(); const current = vi.fn(() => true);
    const actions = connectionActions(browser.api, document, native.client, current, vi.fn());
    return { ...native, ...browser, current, actions };
}
it('closing a review whose original row disappeared restores keyboard focus to the live local-center main landmark', async () => {
    const h = fixture(); document.body.innerHTML = '<main id="center-main" tabindex="-1"></main>';
    h.actions.focusSession('removed-row'); await Promise.resolve(); expect(document.activeElement?.id).toBe('center-main');
    expect(h.port.send).not.toHaveBeenCalled(); expect(h.api.permissions.request).not.toHaveBeenCalled();
});
it('a focus request retired before its queued delivery cannot steal focus from a newer page', async () => {
    const h = fixture(); document.body.innerHTML = '<main id="center-main" tabindex="-1"></main><button id="new-page">Continue</button>';
    document.getElementById('new-page')!.focus(); h.actions.focusReview(); h.current.mockReturnValue(false); await Promise.resolve();
    expect(document.activeElement?.id).toBe('new-page'); expect(h.port.send).not.toHaveBeenCalled();
});
it('disposing the complete local-center DOM before focus delivery has no native effect or synthetic fallback target', async () => {
    const h = fixture(); h.actions.focusSession('removed-row'); await Promise.resolve(); expect(document.activeElement).toBe(document.body);
    expect(h.port.send).not.toHaveBeenCalled(); expect(h.api.tabs.create).not.toHaveBeenCalled();
});
