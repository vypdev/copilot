// @vitest-environment jsdom
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { sessionPreferenceReplyFixture } from '../fixtures/session_preference_reply.ts';
import { renderSessionPreferences as render, sessionPreferenceButton as button, sessionPreferenceChoice as choose, submitSessionPreferenceDraft as submit } from '../fixtures/session_preference_page.ts';
import { decodeSessionPreferenceRead, decodeSessionPreferencePreview } from '../../src/domain/session_preference_reply.ts';
import { publicSessionPreferenceReview } from '../../src/domain/session_preference_client_view.ts';
import type { SessionPreferenceRead } from '../../src/domain/session_preference_read.ts';
import type { SessionPreferenceReviewPlan, SessionPreferenceReviewOutcome } from '../../src/domain/session_preference_review.ts';
import { sessionPreferenceProvenanceCopy } from '../../src/presentation/session_preference_provenance_copy.ts';

let native: Awaited<ReturnType<typeof sessionPreferenceReplyFixture>>; let read: SessionPreferenceRead; let plan: SessionPreferenceReviewPlan;
beforeAll(async () => { native = await sessionPreferenceReplyFixture(); const data = decodeSessionPreferenceRead(native.read); const preview = decodeSessionPreferencePreview(native.preview);
    if (!data || preview?.state !== 'preview') throw new Error('fixture-emitter-unavailable'); read = data; plan = preview; });
afterAll(() => { native?.stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('all 150 feature preferences have accessible local controls and the selected native target has no caller editable scope', () => {
    const h = render(read); expect(document.querySelectorAll('select[id^="session-feature-"]')).toHaveLength(150);
    for (const input of document.querySelectorAll('select')) expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    expect(document.body.textContent).toContain('Work'); expect(document.querySelector('[name="accountId"]')).toBeNull(); expect(h.actions.preview).not.toHaveBeenCalled();
});
it('a changed density drafts one explicit replacement with the observed revision and no native scope or operation selector', () => {
    const h = render(read); choose('session-density', 'compact'); submit(); expect(h.actions.preview).toHaveBeenCalledExactlyOnceWith({ type: 'replace', preferences: { density: 'compact' } }, 0);
    expect(h.actions.dirty).toHaveBeenLastCalledWith(true); expect(h.actions.confirm).not.toHaveBeenCalled();
});
it('false and inherit remain separate authoring values while the feature filter never deletes hidden authored overrides', () => {
    const h = render(read); choose('session-paused', 'no'); choose('session-feature-BEX-NAV-01', 'no');
    const search = document.getElementById('session-feature-filter') as HTMLInputElement; search.value = 'BEX-CODE-01'; search.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    expect(document.querySelectorAll('select[id^="session-feature-"]')).toHaveLength(1); choose('session-feature-BEX-CODE-01', 'yes'); submit();
    expect(h.actions.preview).toHaveBeenCalledWith({ type: 'replace', preferences: { paused: false, features: { 'BEX-CODE-01': true, 'BEX-NAV-01': false } } }, 0); expect(h.actions.read).not.toHaveBeenCalled();
});
it.each(['future', 'corrupt', 'unavailable'] as const)('initial %s native data is preserved and cannot render an invented editable empty document', state => {
    const h = render({ ...read, loaded: { state }, effective: null }); expect(document.querySelector('form')).toBeNull(); expect(document.body.textContent).toContain(h.copy.issues[state]); expect(h.actions.preview).not.toHaveBeenCalled();
});
it.each(['idle', 'reading', 'stale', 'unavailable'] as const)('%s metadata cannot render retained native source labels or permit authoring', phase => {
    const h = render(read, { reader: { phase, current: false, data: read } }); expect(document.querySelector('form')).toBeNull(); expect(document.body.textContent).not.toContain('Work');
    expect(button(h.copy.read).disabled).toBe(phase === 'reading');
});
it('an observer can inspect but cannot edit preferences, clear them or confirm a reviewed operation', () => {
    const h = render(read, { review: publicSessionPreferenceReview(plan, 'preview') }, false); button(h.copy.read).click(); button(h.copy.confirm).click();
    expect(h.actions.read).toHaveBeenCalledOnce(); expect(h.actions.confirm).not.toHaveBeenCalled(); expect(document.querySelector('fieldset')?.disabled).toBe(true);
});
it('an unavailable native page disables read admission independently from its visible explanatory copy', () => {
    const h = render(read, {}, false, false); expect(button(h.copy.read).disabled).toBe(true); expect(h.actions.read).not.toHaveBeenCalled();
});
it('changed source metadata preserves the draft and blocks both button and synthetic form submission until explicit rebasing', () => {
    const h = render(read); choose('session-density', 'compact'); const next = { ...read, settingsRevision: read.settingsRevision! + 1 };
    h.update({ ...h.context, view: { ...h.context.view, reader: { phase: 'ready', current: true, data: next } } });
    expect((document.getElementById('session-density') as HTMLSelectElement).value).toBe('compact'); expect(document.body.textContent).toContain(h.copy.changed); submit(); expect(h.actions.preview).not.toHaveBeenCalled();
    button(h.copy.rebase).click(); flushSync(); submit(); expect(h.actions.preview).toHaveBeenCalledWith({ type: 'replace', preferences: { density: 'compact' } }, 0);
});
it('a lost verified target keeps authored values while permitting explicit local discard against known current native values', () => {
    const h = render(read); choose('session-density', 'compact'); h.update({ ...h.context, view: { ...h.context.view, reader: { phase: 'ready', current: true, data: { ...read, source: { state: 'disconnected' }, effective: null } } } });
    expect(document.body.textContent).toContain(h.copy.changed); expect(document.querySelector('fieldset')?.disabled).toBe(true);
    button(h.copy.resetDraft).click(); flushSync(); expect((document.getElementById('session-density') as HTMLSelectElement).selectedIndex).toBe(0); expect(h.actions.dirty).toHaveBeenLastCalledWith(false);
});
it('refreshing metadata preserves the exact authored select node and its focus without sending or discarding a draft', () => {
    const h = render(read); choose('session-density', 'compact'); const input = document.getElementById('session-density') as HTMLSelectElement; input.focus();
    h.update({ ...h.context, view: { ...h.context.view, reader: { phase: 'reading', current: false, data: null } } });
    expect(document.getElementById('session-density')).toBe(input); expect(input.value).toBe('compact'); expect(document.activeElement).toBe(input);
    h.update(h.context); expect(input.value).toBe('compact'); expect(h.actions.preview).not.toHaveBeenCalled();
});
it('a known committed replacement accepts a clean baseline only after matching current native metadata; its result remains separate', () => {
    const h = render(read); choose('session-density', 'compact'); choose('session-paused', 'yes');
    const outcome: SessionPreferenceReviewOutcome = { state: 'result', outcome: { state: 'committed', revision: 1, acknowledgement: 'accepted', current: true }, facts: { attempt: 'submitted', acknowledgement: 'accepted', observation: 'committed' } };
    const review = publicSessionPreferenceReview(plan, 'result', outcome);
    h.update({ ...h.context, view: { ...h.context.view, review } }); expect(h.actions.dirty).toHaveBeenLastCalledWith(true);
    h.update({ ...h.context, view: { ...h.context.view, review, reader: { phase: 'ready', current: true, data: { ...read, loaded: { state: 'ready', value: plan.after }, effective: plan.effectiveAfter, restriction: plan.restrictionAfter } } } });
    expect(h.actions.dirty).toHaveBeenLastCalledWith(false); expect(document.querySelector('[data-session-preference-review]')).not.toBeNull();
});
it('a later matching document cannot mark an unknown operation or its authored draft saved', () => {
    const h = render(read); choose('session-density', 'compact'); choose('session-paused', 'yes');
    h.update({ ...h.context, view: { ...h.context.view, review: publicSessionPreferenceReview(plan, 'unknown'), reader: { phase: 'ready', current: true, data: { ...read, loaded: { state: 'ready', value: plan.after } } } } });
    expect(h.actions.dirty).toHaveBeenLastCalledWith(true); expect(document.body.textContent).toContain(h.copy.noReplay); expect(h.actions.confirm).not.toHaveBeenCalled();
});
it('clearing a known native document remains reviewable without readable saved settings or a verified connection', () => {
    const h = render({ ...read, loaded: { state: 'ready', value: plan.after }, settingsState: 'future', settingsRevision: null, source: { state: 'unavailable' }, effective: null });
    button(h.copy.clear).click(); expect(h.actions.preview).toHaveBeenCalledExactlyOnceWith({ type: 'clear' }, 1); expect(document.querySelector('fieldset')?.disabled).toBe(true);
});
it('extra precaution blocks authoring and clearing but permits an explicit adoption review of known native data', () => {
    const h = render({ ...read, precaution: true }); expect(document.querySelector('fieldset')?.disabled).toBe(true); expect(button(h.copy.clear).disabled).toBe(true);
    button(h.copy.adopt).click(); expect(h.actions.preview).toHaveBeenCalledExactlyOnceWith({ type: 'adopt-observed' }, 0); expect(document.body.textContent).toContain(h.copy.precaution);
});
it('pending native work independently disables every effect without presenting the operation as complete', () => {
    const h = render({ ...read, pending: true }); expect(document.querySelector('fieldset')?.disabled).toBe(true); expect(button(h.copy.clear).disabled).toBe(true); expect(document.body.textContent).toContain(h.copy.issues.busy);
});
it('review presents before/after values and effective preferences without rendering retained selectors or scope identifiers', () => {
    const h = render(read, { review: publicSessionPreferenceReview(plan, 'preview') }); expect(document.body.textContent).toContain(h.copy.before); expect(document.body.textContent).toContain(h.copy.after);
    expect(document.body.textContent).not.toContain(plan.operationId); expect(document.body.textContent).not.toContain(plan.after.scope!.entryId);
    button(h.copy.confirm).click(); button(h.copy.cancel).click(); expect(h.actions.confirm).toHaveBeenCalledOnce(); expect(h.actions.cancel).toHaveBeenCalledOnce();
});
const results: readonly SessionPreferenceReviewOutcome[] = [
    { state: 'result', outcome: { state: 'committed', revision: 1, acknowledgement: 'unknown', current: false }, facts: { attempt: 'submitted', acknowledgement: 'unknown', observation: 'committed' } },
    { state: 'result', outcome: { state: 'unknown', acknowledgement: 'accepted', observation: 'different', observedRevision: 0, current: true }, facts: { attempt: 'submitted', acknowledgement: 'accepted', observation: 'different' } },
    { state: 'result', outcome: { state: 'reconciled', revision: 0, current: true }, facts: { attempt: 'unobserved', acknowledgement: null, observation: null } },
    { state: 'result', outcome: { state: 'cancelled' }, facts: { attempt: 'unobserved', acknowledgement: null, observation: null } },
    { state: 'pending', facts: { attempt: 'submitted', acknowledgement: null, observation: null } }, { state: 'not-submitted' }, { state: 'expired' },
];
it.each(results)('the $state operation exposes factual acknowledgement and observation independently and never a replay button', outcome => {
    const h = render(read, { review: publicSessionPreferenceReview(plan, 'unknown', outcome), canInspect: true });
    expect(document.querySelector('[data-session-preference-review]')).not.toBeNull(); expect(document.querySelector('[data-session-preference-review]')?.textContent).toContain(h.copy.noReplay);
    button(h.copy.inspect).click(); button(h.copy.dismiss).click(); expect(h.actions.inspect).toHaveBeenCalledOnce(); expect(h.actions.dismiss).toHaveBeenCalledOnce();
    expect([...document.querySelectorAll('button')].some(node => node.textContent === h.copy.confirm)).toBe(false);
});
it('retired source labels are removed while scalar result facts stay visible and cannot be confirmed again', () => {
    const h = render(read, { review: publicSessionPreferenceReview(plan, 'stale', results[0]) }); expect(document.querySelector('[data-session-preference-review]')?.textContent).not.toContain('Work');
    expect(document.querySelector('[data-session-preference-review]')?.textContent).toContain(h.copy.committed); expect(button(h.copy.inspect).disabled).toBe(true);
});
it('busy native completion and exact inspection disable dismissal or another inspection without implying success', () => {
    const h = render(read, { review: publicSessionPreferenceReview(plan, 'committing'), busy: true, checking: true, canInspect: true });
    expect(button(h.copy.dismiss).disabled).toBe(true); expect(button(h.copy.inspect).disabled).toBe(true); expect(h.actions.confirm).not.toHaveBeenCalled();
});
it('a native adoption review works with unavailable source labels and effective saved values while clearly naming its no-write purpose', () => {
    const adoption = { ...plan, action: 'adopt-observed' as const, source: null, settingsRevision: null, before: plan.before, after: plan.before,
        effectiveBefore: null, effectiveAfter: null, restrictionAfter: plan.restrictionBefore, precautionBefore: true };
    const h = render({ ...read, source: null, settingsState: 'unavailable', settingsRevision: null, effective: null, precaution: true }, { review: publicSessionPreferenceReview(adoption, 'preview') });
    expect(document.querySelector('[data-session-preference-review]')?.textContent).toContain(h.copy.adoption); expect(document.querySelector('[data-session-preference-review]')?.textContent).not.toContain('Work');
    button(h.copy.confirm).click(); expect(h.actions.confirm).toHaveBeenCalledOnce();
});
it.each(['retained', 'unknown', 'inactive'] as const)('the native %s restriction remains visibly independent of effective saved preferences', reason => {
    render({ ...read, restriction: { paused: reason !== 'inactive', reason } }); expect(document.body.textContent).toContain(sessionPreferenceProvenanceCopy('en').scopes[reason]);
});
it.each(['conflict', 'stale', 'unavailable', 'future', 'corrupt', 'busy', 'unchanged', 'invalid'] as const)('a native %s result is a bounded operation failure rather than success or an acknowledgement', state => {
    const outcome = { state: 'result' as const, outcome: { state }, facts: { attempt: 'unobserved' as const, acknowledgement: null, observation: null } };
    const h = render(read, { review: publicSessionPreferenceReview(plan, 'result', outcome) }); expect(document.querySelector('[data-session-preference-review]')?.textContent).toContain(h.copy.issues[state]);
    expect(button(h.copy.inspect).disabled).toBe(true); expect(h.actions.confirm).not.toHaveBeenCalled();
});
