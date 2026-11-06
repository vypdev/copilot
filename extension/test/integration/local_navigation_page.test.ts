// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { render, ready, navigate } from '../fixtures/center_app_dom.ts';
import { navigationSettings } from '../fixtures/local_navigation.ts';
import { navigationCopy } from '../../src/domain/navigation_copy.ts';
import { featureText } from '../../src/domain/feature_text.ts';
import { FEATURE_METADATA } from '../../src/domain/feature_metadata.ts';
import { inventoryCopy } from '../../src/domain/inventory_copy.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

const copy = navigationCopy('en');
const opened = (text: string) => ready(() => document.body.textContent?.includes(text) === true);
it('Work presents saved ordered favorites and scoped authored selections as real local links with escaped labels', async () => {
    const h = await render('work', false, navigationSettings(), true, undefined, 'en'); await opened(copy.workIntro);
    expect([...document.querySelectorAll('[data-work-favorite]')].map(node => node.getAttribute('data-work-favorite'))).toEqual(['BEX-CODE-01', 'BEX-CENTER-11']);
    expect(document.querySelector('a[href="#/profiles/work"]')?.textContent).toBe('Work <safe>'); expect(document.querySelector('[data-work-group] h3')?.textContent).toBe('Team <safe>');
    expect(document.querySelector('[data-work-group]')?.textContent).toContain(`${copy.references}: 2`); expect(document.body.textContent).toContain(copy.savedScope);
    expect(document.querySelector('[data-work-group]')?.textContent).toContain(copy.selected); expect(document.querySelector('safe,img,script,iframe')).toBeNull();
    expect(document.body.textContent).not.toMatch(/opaque-session-reference|unbound-0-0/); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('empty Work offers useful exact local tools and the canonical GitHub-work dependency without fake work results', async () => {
    await render('work', false, DEFAULT_SETTINGS, true, undefined, 'en'); await opened(copy.emptyFavorites);
    expect(document.body.textContent).toContain(copy.emptyProfiles); expect(document.body.textContent).toContain(copy.emptyGroups);
    expect(document.querySelector('a[href="#/repositories/workspaces"]')).not.toBeNull(); expect(document.querySelector('a[href="#/shortcuts"]')).not.toBeNull();
    expect(document.querySelector('a[href="https://github.com/vypdev/copilot/issues/707"]')?.textContent).toContain('H6'); expect(document.querySelector('main form')).toBeNull();
});
it('Attention names the saved global, onboarding and selected-profile review causes with exact existing destinations', async () => {
    const h = await render('attention', false, { ...navigationSettings(), paused: true }, true, undefined, 'en'); await opened(copy.attentionIntro);
    expect([...document.querySelectorAll('[data-attention-kind]')].map(node => node.getAttribute('data-attention-kind'))).toEqual(['globalPause', 'onboarding', 'profilePause']);
    expect(document.querySelector('[data-attention-kind=globalPause] a')?.getAttribute('href')).toBe('#/overview');
    expect(document.querySelector('[data-attention-kind=onboarding] a')?.getAttribute('href')).toBe('#/welcome');
    expect(document.querySelector('[data-attention-kind=profilePause] a')?.getAttribute('href')).toBe('#/profiles/work');
    expect(document.querySelector('[data-attention-kind=profilePause]')?.textContent).toContain(copy.profilePause); expect(h.native.port.set).not.toHaveBeenCalled();
});
it('an empty Attention list limits its claim to the saved revision and leaves actual inspection tools available', async () => {
    await render('attention', false, { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, onboarding: 'complete' } }, true, undefined, 'en'); await opened(copy.emptyAttention);
    expect(document.querySelector('[data-local-attention]')).toBeNull(); expect(document.body.textContent).toContain(copy.notInspected);
    expect(document.querySelector('main a[href="#/privacy"]')).not.toBeNull(); expect(document.querySelector('main a[href="#/connections"]')).not.toBeNull();
    expect(document.querySelector('main a[href="#/diagnostics"]')).not.toBeNull();
});
it('Copilot and Setup expose distinct useful local tools and complete canonical capability guides with their actual implementation plans', async () => {
    for (const [route, family, issue, intro] of [['copilot', 'COPILOT', 710, copy.copilotIntro], ['setup', 'SETUP', 712, copy.setupIntro]] as const) {
        const h = await render(route, false, DEFAULT_SETTINGS, true, undefined, 'en'); await opened(intro);
        expect(document.querySelector('[data-dependency-plan]')?.getAttribute('href')).toBe(`https://github.com/vypdev/copilot/issues/${issue}`);
        const list = document.querySelector('#dependency-guides-heading')!.nextElementSibling!;
        expect([...list.querySelectorAll('a')].map(node => node.getAttribute('href'))).toEqual(FEATURE_METADATA.filter(value => value.family === family).map(value => `#/features/${value.id}`));
        expect(document.querySelector('#dependency-tools-heading')?.nextElementSibling?.querySelectorAll('a')).toHaveLength(4); expect(document.querySelector('main form,input')).toBeNull();
        expect(h.native.port.set).not.toHaveBeenCalled(); h.stop(); await ready(() => !document.querySelector('main'));
    }
});
it('every packaged locale renders all four useful views and their canonical feature titles without partial fallback', async () => {
    for (const locale of ['en', 'es', 'fr', 'pt'] as const) {
        const local = navigationCopy(locale); const h = await render('work', false, { ...navigationSettings(), locale }, true, undefined, locale); await opened(local.workIntro);
        expect(document.querySelector('[data-work-favorite="BEX-CODE-01"] a')?.textContent).toBe(featureText(FEATURE_METADATA.find(value => value.id === 'BEX-CODE-01')!, locale)[0]);
        await navigate('attention'); await opened(local.attentionIntro); expect(document.body.textContent).toContain(local.notInspected);
        await navigate('copilot'); await opened(local.copilotIntro); await navigate('setup'); await opened(local.setupIntro);
        expect(document.querySelector('#dependency-guides-heading')?.textContent).toBe(local.guides); h.stop(); await ready(() => !document.querySelector('main'));
    }
});
it('feature guides and Your data reveal separate actual activity, diagnostic, cache, credential and pause tools', async () => {
    const h = await render('features/BEX-CENTER-09', false, DEFAULT_SETTINGS, true, undefined, 'en');
    for (const [id, expected] of [['BEX-CENTER-09', ['activity']], ['BEX-CENTER-10', ['diagnostics']], ['BEX-CENTER-14', ['data', 'privacy', 'connections', 'overview']]] as const) {
        if (id !== 'BEX-CENTER-09') await navigate(`features/${id}`); await ready(() => !!document.querySelector(`[data-feature-detail="${id}"]`));
        const heading = [...document.querySelectorAll('article h3')].find(node => node.textContent === inventoryCopy('en').currentTools)!;
        expect([...heading.nextElementSibling!.querySelectorAll('a')].map(node => node.getAttribute('href'))).toEqual(expected.map(route => `#/${route}`));
    }
    await navigate('data'); await opened(copy.privacyTools);
    expect([...document.querySelector('#data-privacy-tools-heading')!.parentElement!.querySelectorAll('a')].map(node => node.getAttribute('href'))).toEqual(['#/privacy', '#/connections', '#/overview']);
    expect(h.native.port.set).not.toHaveBeenCalled();
});
