// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { completeCenterReview, createCenterReviewFocus } from '../../src/infrastructure/center_review_focus.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import type { ClientReview } from '../../src/domain/center_client_view.ts';

beforeEach(() => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
function fixture() {
    document.body.innerHTML = '<input id="outside"><section aria-labelledby="settings-review-heading">'
        + '<h2 id="settings-review-heading" tabindex="-1">Review</h2><p id="settings-review-status" role="status">Preview</p>'
        + '<div class="actions"><button>Cancel</button></div></section>';
    const section = document.querySelector('section')!;
    const cancel = section.querySelector('button')!; cancel.focus();
    const next = document.createElement('button'); next.textContent = 'Close review';
    next.setAttribute('aria-describedby', 'settings-review-status');
    const activated = vi.fn(); next.onclick = activated;
    const complete = vi.fn(async () => { cancel.remove(); section.querySelector('.actions')!.append(next); });
    return { section, cancel, next, activated, complete };
}
it('moves a removed action to the described result without activating the next action', async () => {
    const h = fixture(); await completeCenterReview(document, h.complete, () => true);
    expect(document.activeElement).toBe(h.next); expect(h.activated).not.toHaveBeenCalled(); expect(h.complete).toHaveBeenCalledOnce();
});
it('hands off a disabled retained action after a settled outcome', async () => {
    const h = fixture(); await completeCenterReview(document, async () => { h.cancel.disabled = true; h.section.querySelector('.actions')!.append(h.next); }, () => true);
    expect(document.activeElement).toBe(h.next);
});
it('chooses explicit current-state recovery before dismissal for an uncertain result', async () => {
    const h = fixture(); const read = h.next.cloneNode(true) as HTMLButtonElement; read.textContent = 'Read current settings';
    const activated = vi.fn(); read.onclick = activated;
    await completeCenterReview(document, async () => { await h.complete(); h.next.before(read); }, () => true);
    expect(document.activeElement).toBe(read); expect(activated).not.toHaveBeenCalled();
});
it('does not move unrelated navigation focus but still executes the requested operation once', async () => {
    const h = fixture(); const outside = document.querySelector<HTMLInputElement>('#outside')!; outside.focus();
    await completeCenterReview(document, h.complete, () => true); expect(document.activeElement).toBe(outside); expect(h.complete).toHaveBeenCalledOnce();
});
it('does not capture an unfocused document', async () => {
    const h = fixture(); vi.mocked(document.hasFocus).mockReturnValue(false);
    await completeCenterReview(document, h.complete, () => true); expect(document.activeElement).not.toBe(h.next);
});
it('does not capture a hidden document', async () => {
    const h = fixture(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await completeCenterReview(document, h.complete, () => true); expect(document.activeElement).not.toBe(h.next);
});
it('tolerates missing native focus without inventing a result handoff', async () => {
    const h = fixture(); vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null);
    await completeCenterReview(document, h.complete, () => true); expect(h.complete).toHaveBeenCalledOnce();
});
it('does not borrow a review from outside the owned document', async () => {
    const h = fixture(); h.section.remove();
    await completeCenterReview(document, h.complete, () => true); expect(document.activeElement).not.toBe(h.next);
});
it('leaves a deliberately focused review heading alone', async () => {
    const h = fixture(); const heading = document.querySelector<HTMLElement>('h2')!; heading.focus();
    await completeCenterReview(document, h.complete, () => true); expect(document.activeElement).toBe(heading);
});
it('leaves an unchanged enabled control focused when completion was rejected', async () => {
    const h = fixture(); await completeCenterReview(document, async () => undefined, () => true); expect(document.activeElement).toBe(h.cancel);
});
it('retires the handoff after a changed context or disposed composition', async () => {
    const h = fixture(); await completeCenterReview(document, h.complete, () => false); expect(document.activeElement).not.toBe(h.next);
});
it('does not focus the detached review after a replacement', async () => {
    const h = fixture(); await completeCenterReview(document, async () => { await h.complete(); h.section.remove(); }, () => true);
    expect(document.activeElement).not.toBe(h.next);
});
it('does not pull focus back after the user switches applications while completion is pending', async () => {
    const h = fixture(); await completeCenterReview(document, async () => { await h.complete(); vi.mocked(document.hasFocus).mockReturnValue(false); }, () => true);
    expect(document.activeElement).not.toBe(h.next);
});
it('does not focus a document hidden while completion was pending', async () => {
    const h = fixture(); await completeCenterReview(document, async () => { await h.complete(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); }, () => true);
    expect(document.activeElement).not.toBe(h.next);
});
it('preserves a newer focus choice made before the outcome arrives', async () => {
    const h = fixture(); const outside = document.querySelector<HTMLInputElement>('#outside')!;
    await completeCenterReview(document, async () => { await h.complete(); outside.focus(); }, () => true); expect(document.activeElement).toBe(outside);
});
it('does not invent an action when the outcome has no enabled next step', async () => {
    const h = fixture(); await completeCenterReview(document, async () => { h.cancel.remove(); }, () => true); expect(document.activeElement).toBe(document.body);
});
it('does not focus a result action that is still disabled', async () => {
    const h = fixture(); h.next.disabled = true; await completeCenterReview(document, h.complete, () => true); expect(document.activeElement).not.toBe(h.next);
});
function review(): ClientReview { return { state: 'preview', revision: 0, expiresAt: 50, action: 'appearance', before: DEFAULT_SETTINGS, after: { ...DEFAULT_SETTINGS, theme: 'dark' } }; }
it('focuses a new preview once without rewinding its focused confirmation on repeated observations', async () => {
    const h = fixture(); const focus = createCenterReviewFocus(document, () => 'appearance'); const value = review();
    focus.observe(value); await tick(); expect(document.activeElement).toBe(document.querySelector('h2'));
    h.cancel.focus(); focus.observe(value); await tick(); expect(document.activeElement).toBe(h.cancel);
});
it('does not focus an older preview after a newer outcome arrives before rendering', async () => {
    const h = fixture(); const focus = createCenterReviewFocus(document, () => 'appearance');
    focus.observe(review()); focus.observe(null); await tick(); expect(document.activeElement).toBe(h.cancel);
});
it('does not focus an old preview after its context changes', async () => {
    const h = fixture(); let context: string | null = 'appearance'; const focus = createCenterReviewFocus(document, () => context);
    focus.observe(review()); context = 'help'; await tick(); expect(document.activeElement).toBe(h.cancel);
});
it('ignores a new preview from an already disposed context', async () => {
    const h = fixture(); const focus = createCenterReviewFocus(document, () => null);
    focus.observe(review()); await tick(); expect(document.activeElement).toBe(h.cancel);
});
it('tolerates teardown of the preview heading before render completion', async () => {
    const h = fixture(); const focus = createCenterReviewFocus(document, () => 'appearance');
    focus.observe(review()); document.querySelector('h2')!.remove(); await tick(); expect(document.activeElement).toBe(h.cancel);
});
it('carries completion context through the operation and retires it if navigation changes', async () => {
    const h = fixture(); let context = 'appearance'; const focus = createCenterReviewFocus(document, () => context);
    await focus.complete(async () => { await h.complete(); context = 'help'; }); expect(document.activeElement).not.toBe(h.next);
});
it('an already disposed context cannot deliver a later completion handoff', async () => {
    const h = fixture(); const focus = createCenterReviewFocus(document, () => null);
    await focus.complete(h.complete); expect(document.activeElement).not.toBe(h.next);
});
