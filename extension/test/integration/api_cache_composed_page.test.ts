// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { afterEach, expect, it, vi } from 'vitest';
import { startCenter } from '../../src/infrastructure/center_app.ts';
import { ReadScheduler } from '../../src/application/read_scheduler.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { apiCacheCopy } from '../../src/domain/api_cache_copy.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
import { button, ready } from '../fixtures/center_app_dom.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); });
it('the complete foreground/native-port/background composition clears once while synchronous native broadcasts refresh observations without HTTP or preference replacement', async () => {
    const raw = { ...DEFAULT_SETTINGS, schemaVersion: 999 }; const copy = apiCacheCopy('en');
    const h = backgroundCenterFixture(browser => { browser.localValues.set(SETTINGS_KEY, raw); });
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(async message => {
        for (const listener of h.onMessage.listeners) listener(message, { id: h.api.runtime.id }, () => undefined);
    });
    // jsdom needs a nonopaque document; keep the background receiver's actual extension origin intact.
    const foreground = { ...h.api, runtime: { ...h.api.runtime, getURL: (path: string) => `https://extension.test/${path}` } };
    window.history.replaceState(null, '', 'https://extension.test/runtime.html#/privacy');
    const cleared = vi.spyOn(ReadScheduler.prototype, 'clearApiCache'); const stop = startCenter(foreground, document, 'en');
    stops.push(() => { stop(); h.stop(); });
    await ready(() => document.querySelector<HTMLButtonElement>('#api-cache-review-button')?.disabled === false, 'current native editor can review cache');
    button(copy.review).click(); await ready(() => document.querySelector('[data-api-cache-status]')?.textContent === copy.states.reviewed, 'native review appears');
    expect(cleared).not.toHaveBeenCalled(); button(copy.confirm).click();
    await ready(() => document.querySelector('[data-api-cache-status]')?.textContent === copy.outcomes.cleared && !button(copy.inspect).disabled, 'clear result survives metadata refresh');
    await ready(() => document.querySelector('[data-operation-stage]')?.textContent === copy.states.cleared, 'current operation observes actual clear');
    button(copy.inspect).click(); await ready(() => !button(copy.inspect).disabled);
    expect(cleared).toHaveBeenCalledOnce(); expect(h.localValues.get(SETTINGS_KEY)).toEqual(raw); expect(h.localArea.set).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled(); expect(h.api.permissions.request).not.toHaveBeenCalled(); expect(h.api.runtime.sendMessage).toHaveBeenCalledWith({ version: 1, method: 'center.invalidated' });
    expect(h.ports).toHaveLength(1); expect(document.body.textContent).not.toContain('operationId');
});
