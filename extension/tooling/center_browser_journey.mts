import { CENTER_ROUTES } from '../src/domain/center_routes.ts';
import { centerCopy } from '../src/domain/center_copy.ts';
import { reviewCopy } from '../src/domain/review_copy.ts';
import { connectionCopy } from '../src/domain/connection_copy.ts';
import { DEFAULT_SETTINGS } from '../src/domain/settings.ts';
import { natural, record } from '../src/domain/value.ts';
import { loadedManifestMatches } from './loaded_manifest.mts';
import { CENTER_BROWSER_SCRIPTS as S, CENTER_SETTINGS_PROBE_KEY } from './center_browser_scripts.mts';
import type { BrowserDriver } from './webdriver.mts';
import type { NativePage } from './webdriver_page.mts';

export type CenterBrowserTarget = 'chrome' | 'firefox';
export const CENTER_BROWSER_VERSIONS = Object.freeze({ chrome: '156.0.8078.80', firefox: '159.0' });
export interface CenterBrowserDriver extends BrowserDriver { readonly page: NativePage }
interface Source { readonly sourceRevision: string; readonly sourceTreeSha256: string }
interface Snapshot { readonly envelope: string; readonly theme: 'github' | 'light' | 'dark'; readonly revision: number }
const REVIEW = 'section[aria-labelledby=settings-review-heading]';
const CONNECTIONS = 'section[aria-labelledby=connections-heading]';
/** Component journey only. Native browser chrome entrypoints and human UX remain separate evidence. */
export async function runCenterBrowserJourney(driver: CenterBrowserDriver, target: CenterBrowserTarget, options: string,
    source: Source, pause: () => Promise<void>): Promise<Readonly<Record<string, unknown>>> {
    const assertions: string[] = [];
    function assert(condition: unknown, name: string): asserts condition {
        if (condition !== true) throw new Error(`assertion:center:${name}`); assertions.push(name);
    }
    const wait = async (script: string, args: unknown[], name: string): Promise<void> => {
        for (let attempt = 0; attempt < 150; attempt++) {
            if (await driver.evaluate(script, args) === true) return; await pause();
        }
        throw new Error(`assertion:center:${name}`);
    };
    const snapshot = async (): Promise<Snapshot> => {
        const value = await driver.evaluateAsync<unknown>(S.snapshot, [CENTER_SETTINGS_PROBE_KEY, DEFAULT_SETTINGS]);
        if (!record(value) || typeof value.envelope !== 'string' || value.envelope.length > 262144
            || !['github', 'light', 'dark'].includes(value.theme as string) || !natural(value.revision)) throw new Error('assertion:center:settings-snapshot');
        return { envelope: value.envelope, theme: value.theme as Snapshot['theme'], revision: value.revision };
    };
    const appearance = async (): Promise<void> => {
        await driver.page.click('nav a[href="#/appearance"]'); await wait(S.appearance, [], 'appearance-editable');
    };
    const closeReview = async (): Promise<void> => {
        await driver.page.click(`${REVIEW} .actions > button:last-child`); await wait(S.appearance, [], 'review-closed');
    };
    const preview = async (): Promise<void> => {
        await driver.page.click('main form button[type=submit]'); await wait(S.review, [review.states.preview], 'preview-ready');
    };
    assert(driver.capabilities.browserName === target, 'native-engine');
    assert(driver.capabilities.browserVersion === CENTER_BROWSER_VERSIONS[target], 'pinned-browser-version');
    let location: URL;
    try { location = new URL(options); } catch { throw new Error('assertion:center:packaged-options-location'); }
    assert(location.protocol === (target === 'chrome' ? 'chrome-extension:' : 'moz-extension:')
        && location.pathname === '/runtime.html' && !location.search && !location.hash, 'packaged-options-location');
    await wait(S.ready, [], 'center-ready');
    const metadata = await driver.evaluate<unknown>(S.metadata);
    assert(record(metadata), 'native-metadata');
    assert(typeof metadata.root === 'string' && options === `${metadata.root}runtime.html`
        && loadedManifestMatches(target, metadata.manifest, metadata.root), 'loaded-manifest');
    assert(metadata.source === source.sourceTreeSha256, 'loaded-source');
    assert(typeof metadata.id === 'string' && metadata.id.length > 0, 'native-extension-identity');
    assert(['en', 'es', 'fr', 'pt'].includes(metadata.locale as string), 'closed-locale');
    const copy = centerCopy(metadata.locale); const review = reviewCopy(copy.locale); const connections = connectionCopy(copy.locale);
    await wait(S.editor, [copy.messages.editor], 'editor-owned');
    const background = await driver.evaluateAsync<unknown>(S.background);
    assert(record(background) && background.source === source.sourceTreeSha256 && background.state === 'ready', 'loaded-background-source');
    const before = await snapshot();
    assert(before.envelope === 'null' && before.revision === 0 && before.theme === DEFAULT_SETTINGS.theme, 'fresh-preference-store');
    await driver.page.click('nav a[href="#/connections"]'); await wait(S.sessions, [connections.disconnected], 'initial-vault-disconnected');
    await wait(S.emptySessions, [connections.empty], 'initial-vault-empty'); await appearance();
    assert(await driver.evaluate(S.theme) === before.theme, 'initial-theme-observed');
    // The admitted fresh store above has the documented GitHub theme, so Dark is the deliberate change.
    const changed = 'dark';
    await driver.page.select('#center-theme', changed); await preview();
    assert((await snapshot()).envelope === before.envelope, 'preview-no-write');
    await driver.page.click(`${REVIEW} .actions > button:nth-child(2)`); await wait(S.review, [review.states.cancelled], 'cancelled');
    assert((await snapshot()).envelope === before.envelope, 'cancel-no-write'); await closeReview();
    assert(await driver.evaluate(S.theme) === changed, 'cancel-retains-local-draft');
    await preview(); await driver.page.click(`${REVIEW} .actions > button:first-child`);
    await wait(S.review, [review.states.saved], 'saved');
    const saved = await snapshot();
    assert(saved.theme === changed && saved.revision === before.revision + 1, 'confirmed-complete-revision'); await closeReview();
    const routes: string[] = [];
    for (const route of CENTER_ROUTES) {
        await driver.page.click(`nav a[href="#/${route}"]`); await wait(S.ready, [], `route-${route}`);
        await wait(S.routeReady, [copy.messages.loading, copy.routes[route], `#/${route}`], `route-${route}-content`);
        const observed = await driver.evaluate<unknown>(S.route);
        assert(record(observed) && observed.heading === copy.routes[route] && observed.active === `#/${route}`
            && observed.source === source.sourceTreeSha256, `route-${route}-source-heading`);
        await wait(S.editor, [copy.messages.editor], `route-${route}-editor`); routes.push(route);
    }
    await appearance(); assert(await driver.evaluate(S.theme) === changed, 'routes-retain-saved-theme');
    const oldOrigin = await driver.evaluate<unknown>(S.timeOrigin);
    await driver.navigate('about:blank'); await driver.navigate(options); await wait(S.ready, [], 'recreated-document');
    await wait(S.editor, [copy.messages.editor], 'recreated-editor'); await appearance();
    const newOrigin = await driver.evaluate<unknown>(S.timeOrigin); const reopened = await snapshot();
    assert(typeof oldOrigin === 'number' && typeof newOrigin === 'number' && oldOrigin !== newOrigin, 'real-document-recreated');
    assert(reopened.envelope === saved.envelope && await driver.evaluate(S.theme) === changed, 'reopen-no-write-and-retained-value');
    const providers = await driver.evaluateAsync<unknown>(S.providers, ['copilot.h3.native-probe.v1', source.sourceTreeSha256]);
    assert(record(providers) && providers.local === true && providers.session === true && providers.clean === true, 'native-local-session-provider-roundtrip-cleanup');
    await driver.page.click('nav a[href="#/connections"]'); await wait(S.sessions, [connections.disconnected], 'sessions-disconnected');
    await wait(S.emptySessions, [connections.empty], 'fresh-vault-empty');
    await driver.page.click(`${CONNECTIONS} > button:first-of-type`); await wait(S.sessions, [connections.disconnected], 'explicit-session-read');
    await driver.page.click(`${CONNECTIONS} > button:nth-of-type(2)`);
    await driver.page.click(`${CONNECTIONS} > .notice[role=alert] > button:first-of-type`);
    await driver.page.click('main > .toolbar > button:last-of-type'); await wait(S.editor, [copy.messages.editor], 'post-revocation-editor-read');
    await wait(S.sessions, [connections.disconnected], 'empty-vault-revoked');
    await appearance(); assert(await driver.evaluate(S.theme) === changed, 'session-revocation-retains-preferences');
    await driver.page.select('#center-theme', before.theme); await preview(); await driver.page.click(`${REVIEW} .actions > button:first-child`);
    await wait(S.review, [review.states.saved], 'original-theme-restored'); await closeReview();
    assert((await snapshot()).theme === before.theme, 'restore-readback');
    return Object.freeze({ schemaVersion: 1, evidence: 'actual-native-center-component-journey', target,
        sourceRevision: source.sourceRevision, sourceTreeSha256: source.sourceTreeSha256,
        browserVersion: driver.capabilities.browserVersion, locale: copy.locale, assertions, routes,
        entrypoint: 'extension-owned GitHub Runtime settings control', fullH3Acceptance: false,
        recovery: 'Destroyed and reopened the owned document; no background-idle or uncertain-write claim.',
        sessions: 'Fresh empty protected-vault UI read and explicit revocation; nonsecret local/session API probe is separate. No credential or provider response injected.',
        remaining: ['Native toolbar and browser Settings entrypoints', 'Independent human accessibility', 'Other normative H3 acceptance cases'],
    });
}
