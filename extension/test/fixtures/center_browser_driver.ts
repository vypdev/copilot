import { vi } from 'vitest';
import { NativePage } from '../../tooling/webdriver_page.mts';
import { CENTER_BROWSER_SCRIPTS as S } from '../../tooling/center_browser_scripts.mts';
import { CENTER_BROWSER_VERSIONS, type CenterBrowserTarget, type CenterBrowserDriver } from '../../tooling/center_browser_journey.mts';
import { targetManifest } from '../../src/infrastructure/target_manifests.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { reviewCopy } from '../../src/domain/review_copy.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

export const CENTER_SOURCE = { sourceRevision: 'a'.repeat(40), sourceTreeSha256: 'b'.repeat(64) };
/** Deterministic assertion-oracle fixture, never actual browser evidence. */
export function centerBrowserDriver(target: CenterBrowserTarget = 'chrome') {
    const root = target === 'chrome' ? 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/' : 'moz-extension://00000000-0000-4000-8000-000000000704/';
    const options = `${root}runtime.html`; const copy = centerCopy('en'); const review = reviewCopy('en');
    let route = 'overview'; let saved = DEFAULT_SETTINGS.theme; let draft = saved; let revision = 0; let origin = 1;
    let state = review.states.preview; let envelope = 'null';
    const page = new NativePage(async () => { throw new Error('unexpected fixture wire command'); });
    const click = vi.spyOn(page, 'click').mockImplementation(async selector => {
        const destination = /^nav a\[href="#\/([a-z]+)"\]$/u.exec(selector);
        if (destination) { route = destination[1]; return; }
        if (selector === 'main form button[type=submit]') state = review.states.preview;
        else if (selector.includes('settings-review-heading')) {
            if (selector.endsWith('button:nth-child(2)')) state = review.states.cancelled;
            if (selector.endsWith('button:first-child')) {
                saved = draft; revision++; envelope = JSON.stringify({ current: { theme: saved, revision } }); state = review.states.saved;
            }
        }
    });
    vi.spyOn(page, 'select').mockImplementation(async (_selector, value) => { draft = value as typeof draft; });
    const snapshot = () => ({ envelope, theme: saved, revision });
    const metadata = () => ({ root, id: 'owned', manifest: targetManifest(target), source: CENTER_SOURCE.sourceTreeSha256, locale: 'en' });
    const evaluate = vi.fn(async (script: string, args: unknown[] = []): Promise<unknown> => {
        if (script === S.metadata) return metadata();
        if (script === S.theme) return draft;
        if (script === S.timeOrigin) return origin;
        if (script === S.route) return { heading: copy.routes[route as keyof typeof copy.routes], active: `#/${route}`, source: CENTER_SOURCE.sourceTreeSha256 };
        if (script === S.review) return args[0] === state;
        if (([S.ready, S.editor, S.appearance, S.routeReady, S.sessions, S.emptySessions] as string[]).includes(script)) return true;
        throw new Error('unexpected inspection');
    });
    const evaluateAsync = vi.fn(async (script: string): Promise<unknown> => {
        if (script === S.snapshot) return snapshot();
        if (script === S.background) return { source: CENTER_SOURCE.sourceTreeSha256, state: 'ready' };
        if (script === S.providers) return { local: true, session: true, clean: true };
        throw new Error('unexpected async inspection');
    });
    const driver: CenterBrowserDriver = { page, capabilities: { browserName: target, browserVersion: CENTER_BROWSER_VERSIONS[target] },
        evaluate: evaluate as CenterBrowserDriver['evaluate'], evaluateAsync: evaluateAsync as CenterBrowserDriver['evaluateAsync'],
        navigate: vi.fn(async () => { origin++; draft = saved; }), focusFixture: vi.fn(), openRuntimeOptions: vi.fn(async () => options), close: vi.fn() };
    return { driver, options, click, evaluate, evaluateAsync, snapshot, metadata };
}
