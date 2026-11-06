import { vi } from 'vitest';
import { backgroundCenterFixture } from './background_center.ts';
import { githubDom } from './dom.ts';
import { pageSender, scopedSettings } from './page_configuration.ts';
import { CONNECTED } from './runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { startContent } from '../../src/infrastructure/content_runtime.ts';
import { record } from '../../src/domain/value.ts';

/** Real background/content composition with deterministic native ports; not a loaded-browser claim. */
export function provenanceContent(native?: unknown, locale: 'en' | 'es' | 'fr' | 'pt' = 'en') {
    const dom = githubDom();
    const h = backgroundCenterFixture(browser => {
        browser.localValues.set(SETTINGS_KEY, { ...scopedSettings(), locale }); browser.sessionValues.set(SESSION_KEY, CONNECTED);
        if (native !== undefined) browser.sessionValues.set(TEMPORARY_PAUSES_KEY, native);
    });
    const background = [...h.onMessage.listeners][0];
    const notify = (value: unknown) => { for (const listener of h.onMessage.listeners) if (listener !== background) listener(value, { id: 'test' }, () => undefined); };
    vi.mocked(h.api.tabs.query).mockResolvedValue([{ id: 7 }]);
    vi.mocked(h.api.tabs.sendMessage).mockImplementation(async (id, value) => { if (id === 7) notify(value); });
    vi.mocked(h.api.runtime.sendMessage).mockImplementation(async value => {
        if (record(value) && typeof value.method === 'string' && value.method.startsWith('center.')) { notify(value); return { state: 'notified' }; }
        return h.call(value, { ...pageSender, tab: { ...pageSender.tab, id: 7 } });
    });
    let stopContent: (() => void) | undefined;
    return { ...h, ...dom, notify, mount: () => { stopContent = startContent(h.api, dom.window, dom.document); },
        panel: () => dom.document.querySelector<HTMLElement>('[data-copilot-runtime]'),
        stop: () => { stopContent?.(); h.stop(); dom.dom.window.close(); } };
}
