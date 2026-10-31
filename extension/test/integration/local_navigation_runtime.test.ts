// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { afterEach, expect, it, vi } from 'vitest';
import { navigationRuntime } from '../fixtures/local_navigation_runtime.ts';
import { navigationSettings } from '../fixtures/local_navigation.ts';
import { ready, navigate } from '../fixtures/center_app_dom.ts';
import { navigationCopy } from '../../src/domain/navigation_copy.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); });
const copy = navigationCopy('en');
const opened = (text: string) => ready(() => document.body.textContent?.includes(text) === true);
const fixture = async (route: string, settings: unknown = navigationSettings(), observer = false) => { const h = await navigationRuntime(route, settings, observer); stops.push(h.stop); return h; };
it('actual entry into all four local views performs no provider request, retained credential read, preference write or new grant', async () => {
    for (const [route, text] of [['work', copy.workIntro], ['attention', copy.attentionIntro], ['copilot', copy.copilotIntro], ['setup', copy.setupIntro]]) {
        const settings = navigationSettings(); const h = await fixture(route, settings); await opened(text);
        expect(h.provider).not.toHaveBeenCalled(); expect(h.sessionArea.get).not.toHaveBeenCalledWith(SESSION_KEY);
        expect(h.localValues.get(SETTINGS_KEY)).toEqual(settings); expect(h.localArea.set).not.toHaveBeenCalled(); expect(h.sessionArea.set).not.toHaveBeenCalled(); expect(h.api.permissions.request).not.toHaveBeenCalled();
        expect(document.body.textContent).not.toContain('synthetic_not_a_real_credential'); h.stop(); await ready(() => !document.querySelector('main'));
    }
});
it('all local navigation and planned capability guides remain useful offline without a CLI or remote response', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const h = await fixture('work'); await opened(copy.workIntro); await navigate('attention'); await opened(copy.attentionIntro);
    await navigate('copilot'); await opened(copy.copilotIntro); await navigate('setup'); await opened(copy.setupIntro);
    expect(document.querySelector('[data-dependency-plan]')?.getAttribute('href')).toBe('https://github.com/vypdev/copilot/issues/712');
    expect(h.provider).not.toHaveBeenCalled(); expect(h.localArea.set).not.toHaveBeenCalled(); expect(h.api.permissions.request).not.toHaveBeenCalled();
});
it('an actual observer can use saved navigation without claiming editing control or changing any stored choice', async () => {
    const h = await fixture('work', navigationSettings(), true); await opened(copy.workIntro);
    expect(document.querySelector('.toolbar')?.textContent).toContain(centerCopy('en').messages.takeControl);
    await navigate('attention'); await opened(copy.attentionIntro); expect(document.querySelector('[data-attention-kind=profilePause] a')?.getAttribute('href')).toBe('#/profiles/work');
    const methods = h.ports.flatMap(pair => vi.mocked(pair.client.postMessage).mock.calls.map(([frame]) => (frame as { message: { method: string } }).message.method));
    expect(methods).not.toContain('center.claim'); expect(methods).not.toContain('center.preview'); expect(h.localArea.set).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
it('a confirmed revision from another native editor updates the readonly workspace without reviving the retired editing owner', async () => {
    const initial = navigationSettings(); const h = await fixture('work', { ...initial, center: { ...initial.center, selectedWorkspace: null } }); await opened(copy.workIntro);
    expect(document.querySelectorAll('[data-work-favorite]')).toHaveLength(2);
    const writer = await h.client(); await writer.takeControl(); await writer.preview({ type: 'center', values: { favorites: ['BEX-CENTER-12'] } }, 0);
    expect(writer.view.review?.state).toBe('preview'); await writer.confirm(); expect(writer.view.review?.state).toBe('saved');
    await ready(() => document.querySelectorAll('[data-work-favorite]').length === 1 && document.querySelector('[data-work-favorite]')?.getAttribute('data-work-favorite') === 'BEX-CENTER-12');
    expect(document.querySelector('[data-work-group]')?.textContent).not.toContain(copy.selected);
    expect(document.querySelector('.toolbar')?.textContent).toContain(centerCopy('en').messages.takeControl); expect(h.provider).not.toHaveBeenCalled();
    expect(h.localValues.get(SETTINGS_KEY)).toMatchObject({ current: { revision: 1, center: { favorites: ['BEX-CENTER-12'], selectedWorkspace: null } } });
});
it('a future saved document remains preserved through all four recovery-gated routes without invented workspace choices', async () => {
    const source = { ...DEFAULT_SETTINGS, schemaVersion: 999, privateFuture: 'do-not-render' };
    const h = await fixture('work', source);
    for (const route of ['work', 'attention', 'copilot', 'setup']) {
        if (route !== 'work') await navigate(route); await ready(() => !!document.querySelector('main a[href="#/recovery"]'));
        expect(document.querySelector('[data-work-favorite],[data-local-attention-empty],[data-dependency-plan]')).toBeNull();
        expect(document.body.textContent).not.toContain('do-not-render'); expect(h.localValues.get(SETTINGS_KEY)).toEqual(source);
    }
    expect(h.localArea.set).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
it('a corrupt saved document cannot become an empty workspace or a new default merely through viewing or refreshing these routes', async () => {
    const source = { damaged: 'private-do-not-echo' }; const h = await fixture('attention', source);
    for (const route of ['attention', 'work', 'copilot', 'setup']) {
        if (route !== 'attention') await navigate(route); await ready(() => !!document.querySelector('main a[href="#/recovery"]'));
        expect(document.querySelector('#work-favorites-heading,[data-local-attention-empty],[data-dependency-plan]')).toBeNull(); expect(document.body.textContent).not.toContain(source.damaged);
    }
    expect(h.localValues.get(SETTINGS_KEY)).toEqual(source); expect(h.localArea.set).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
