import { afterEach, vi } from 'vitest';
import { tick } from 'svelte';
import { startBackground } from '../../src/infrastructure/background_runtime.ts';
import { startCenter } from '../../src/infrastructure/center_app.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { browserFixture } from './browser.ts';
import { ready } from './center_app_dom.ts';

const stops: (() => void)[] = [];
afterEach(async () => { for (const stop of stops.splice(0).reverse()) stop(); await tick(); });
/** Whole options/client/native-port/background/storage composition; deterministic fakes, never native-browser acceptance. */
export async function nativeCenterDom(route = 'appearance', locale = 'en') {
    const background = browserFixture(); const foreground = browserFixture();
    vi.stubGlobal('__COPILOT_SOURCE_TREE__', 'unbundled');
    background.localValues.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, locale });
    foreground.api.runtime.getURL = path => `https://extension.test/${path}`;
    foreground.api.runtime.connect = background.api.runtime.connect;
    foreground.api.storage.local = background.api.storage.local; foreground.api.storage.session = background.api.storage.session;
    foreground.api.permissions = background.api.permissions;
    vi.mocked(background.api.runtime.sendMessage).mockImplementation(async value => {
        for (const listener of [...foreground.onMessage.listeners]) listener(value, { id: 'test' }, () => undefined);
        return { state: 'notified' };
    });
    let stopBackground = startBackground(background.api);
    window.history.replaceState(null, '', `https://extension.test/runtime.html#/${route}`);
    const stopCenter = startCenter(foreground.api, document, locale);
    const stop = () => { stopCenter(); stopBackground(); }; stops.push(stop);
    await ready(() => !!document.querySelector('main .revision') && document.querySelector('main')?.getAttribute('aria-busy') === 'false');
    return { background, foreground, stopCenter, stop,
        restart: () => { stopBackground(); stopBackground = startBackground(background.api); },
        settings: () => background.localValues.get(SETTINGS_KEY) as { current?: typeof DEFAULT_SETTINGS },
        loading: () => { for (const listener of background.onUpdated.listeners) {
            listener(1, { status: 'loading', url: 'chrome-extension://test/runtime.html#/appearance' });
            listener(1, { status: 'complete' }); listener(1, { status: 'loading' }); listener(1, { status: 'complete' });
        } },
    };
}
