// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SettingsReview from '../../src/presentation/SettingsReview.svelte';
import { reviewCopy } from '../../src/domain/review_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import type { CenterReview, ReviewState } from '../../src/domain/center_review.ts';

const mounted: Record<string, unknown>[] = [];
afterEach(async () => { for (const value of mounted.splice(0)) await unmount(value); document.body.replaceChildren(); });
function render(state: ReviewState = 'preview', editable = true, changes = true, locale = 'en') {
    const view: CenterReview = { state, editable, revision: 7, title: 'Save the Work profile', summary: centerCopy(locale).messages.reviewSummary,
        changes: changes ? [{ id: 'density', label: 'Page density', before: 'Comfortable', after: 'Compact' }] : [] };
    const actions = { confirm: vi.fn(), cancel: vi.fn(), reload: vi.fn(), dismiss: vi.fn() };
    const app = mount(SettingsReview, { target: document.body, props: { view, copy: reviewCopy(locale), actions } }); mounted.push(app); flushSync();
    return { view, actions, app };
}
it('renders the exact before/after review with named actions and confirms only through its retained callback', () => {
    const h = render(); expect(document.querySelector('h2')?.textContent).toBe(h.view.title);
    expect(document.querySelector('[role=status]')?.textContent).toBe(reviewCopy('en').states.preview);
    expect(document.querySelector('dt')?.textContent).toBe('Page density');
    expect([...document.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['Before Comfortable', 'After Compact']);
    const buttons = [...document.querySelectorAll('button')]; expect(buttons.map(button => button.textContent)).toEqual(['Confirm change', 'Cancel change']);
    buttons[0].click(); expect(h.actions.confirm).toHaveBeenCalledExactlyOnceWith(); expect(h.actions.cancel).not.toHaveBeenCalled();
    buttons[1].click(); expect(h.actions.cancel).toHaveBeenCalledExactlyOnceWith(); expect(h.view.revision).toBe(7);
    expect(document.querySelector('summary')?.textContent).toBe('Technical details'); expect(document.querySelector('code')?.textContent).toBe('7');
});
it('read-only review disables mutation and offers a local dismissal without invoking confirmation', () => {
    const h = render('preview', false); const buttons = [...document.querySelectorAll('button')];
    expect(buttons.slice(0, 2).every(button => button.disabled)).toBe(true);
    expect(document.body.textContent).toContain(reviewCopy('en').observer); buttons[0].click(); buttons[1].click(); buttons[2].click();
    expect(h.actions.confirm).not.toHaveBeenCalled(); expect(h.actions.cancel).not.toHaveBeenCalled(); expect(h.actions.dismiss).toHaveBeenCalledOnce();
});
it('committing review announces busy state and exposes no cancellation that could falsely imply an undo', () => {
    render('committing', false); expect(document.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector('button')).toBeNull(); expect(document.querySelector('[role=status]')?.textContent).toBe(reviewCopy('en').states.committing);
});
it.each(['unknown', 'conflict', 'stale', 'unavailable'] as const)('a %s outcome offers a current-state read and never a repeated Save', state => {
    const h = render(state); const buttons = [...document.querySelectorAll('button')];
    expect(buttons.map(button => button.textContent)).toEqual(['Read current settings', 'Close review']);
    expect(document.querySelector('[role=status]')?.textContent).toBe(reviewCopy('en').states[state]);
    buttons[0].click(); buttons[1].click(); expect(h.actions.reload).toHaveBeenCalledOnce(); expect(h.actions.dismiss).toHaveBeenCalledOnce();
    expect(h.actions.confirm).not.toHaveBeenCalled(); expect(h.actions.cancel).not.toHaveBeenCalled();
});
it.each(['saved', 'cancelled'] as const)('a %s outcome reports its fact and offers dismissal only', state => {
    const h = render(state, true, false, 'es'); const buttons = [...document.querySelectorAll('button')];
    expect(buttons.map(button => button.textContent)).toEqual(['Cerrar revisión']); expect(document.querySelector('dl')).toBeNull();
    expect(document.querySelector('[role=status]')?.textContent).toBe(reviewCopy('es').states[state]); buttons[0].click(); expect(h.actions.dismiss).toHaveBeenCalledOnce();
});
it('untrusted authored labels and content remain text throughout the actual mounted Svelte component', () => {
    const actions = { confirm: vi.fn(), cancel: vi.fn(), reload: vi.fn(), dismiss: vi.fn() };
    const marker = '<img src=x onerror="window.privateRead()">';
    mounted.push(mount(SettingsReview, { target: document.body, props: { copy: reviewCopy('fr'), actions,
        view: { state: 'preview', editable: true, revision: 0, title: marker, summary: marker,
            changes: [{ id: 'local', label: marker, before: marker, after: marker }] } } })); flushSync();
    expect(document.querySelector('img')).toBeNull(); expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('h2')?.textContent).toBe(marker); expect(document.querySelector('dt')?.textContent).toBe(marker);
    expect(document.body.innerHTML).toContain('&lt;img'); expect(document.querySelector('button')?.textContent).toBe(reviewCopy('fr').confirm);
});
