import { vi } from 'vitest';
import { startCenter } from '../../src/infrastructure/center_app.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { backgroundCenterFixture } from './background_center.ts';
import { CONNECTED } from './runtime.ts';
import { ready } from './center_app_dom.ts';

/** Actual foreground/native channel/background composition, with deterministic native/provider ports. */
export async function navigationRuntime(route: string, settings: unknown, observer = false) {
    const h = backgroundCenterFixture(browser => { browser.localValues.set(SETTINGS_KEY, structuredClone(settings)); browser.sessionValues.set(SESSION_KEY, CONNECTED); });
    if (observer) await h.client();
    const background = [...h.onMessage.listeners][0];
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(async value => {
        for (const listener of h.onMessage.listeners) if (listener !== background) listener(value, { id: h.api.runtime.id }, () => undefined);
    });
    const foreground = { ...h.api, runtime: { ...h.api.runtime, getURL: (path: string) => `https://extension.test/${path}` } };
    window.history.replaceState(null, '', `https://extension.test/runtime.html#/${route}`);
    const stopCenter = startCenter(foreground, document, 'en'); let stopped = false;
    const stop = () => { if (stopped) return; stopped = true; stopCenter(); h.stop(); };
    try { await ready(() => document.querySelector('h1') !== null && document.querySelector('main')?.getAttribute('aria-busy') === 'false'); }
    catch (error) { stop(); throw error; }
    return { ...h, stop };
}
