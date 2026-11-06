// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { startCenter } from '../../src/infrastructure/center_app.ts';
import { browserFixture } from '../fixtures/browser.ts';

it('does not register a native client or listeners for a detached document', () => {
    const h = browserFixture(); const document = globalThis.document.implementation.createHTMLDocument('Detached');
    expect(document.defaultView).toBeNull(); startCenter(h.api, document, 'en')();
    expect(h.api.runtime.sendMessage).not.toHaveBeenCalled(); expect(h.onMessage.listeners.size).toBe(0);
});
it('fully replaces rejected initial destinations before sending any native message, without forwarding rejected URL content', () => {
    for (const [search, hash] of [['?private=do-not-forward', '#/overview'], ['', '#/https://foreign.invalid/private'], ['', '#/profiles/../private']]) {
        const h = browserFixture(); const replace = vi.fn();
        const document = { defaultView: { location: { search, hash, replace } } } as unknown as Document;
        startCenter(h.api, document, 'en')();
        expect(replace).toHaveBeenCalledExactlyOnceWith('chrome-extension://test/runtime.html#/recovery');
        expect(h.api.runtime.sendMessage).not.toHaveBeenCalled(); expect(h.onMessage.listeners.size).toBe(0);
    }
});
