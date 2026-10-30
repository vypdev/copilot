// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { renderPausePage as render, pauseButton as button } from '../fixtures/pause_page.ts';
import { pauseControlWire, pausePlanWire } from '../fixtures/pause_wire.ts';
import { publicPauseReview } from '../../src/domain/pause_client_view.ts';
import { pauseObservationCopy } from '../../src/domain/pause_observation_copy.ts';
import type { PauseReviewOutcome } from '../../src/domain/temporary_pause_review.ts';

it('read-only observers can inspect metadata but never acquire mutation authority from rendering or clicking disabled controls', () => {
    const h = render({}, false); button(h.copy.read).click(); expect(h.actions.read).toHaveBeenCalledOnce(); button(h.copy.pause).click(); expect(h.actions.preview).not.toHaveBeenCalled();
    expect(document.querySelector('[data-native-pause-tab] button')?.hasAttribute('disabled')).toBe(true);
});
it('a missing native context disables reads as well as effects without describing any pause as saved', () => {
    const h = render({}, false, false); expect(button(h.copy.read).disabled).toBe(true); expect(h.actions.preview).not.toHaveBeenCalled();
});
it.each(['idle', 'reading', 'unavailable', 'stale'] as const)('%s metadata never renders an editable invented native state or stale tab label', phase => {
    const h = render({ reader: { phase, current: false, data: pauseControlWire() } });
    expect(document.body.textContent).toContain(h.copy.reads[phase]); expect(document.querySelector('fieldset')).toBeNull(); expect(document.querySelector('[data-native-pause-tab]')).toBeNull();
});
it.each(['future', 'corrupt', 'unavailable'] as const)('an unreadable %s native document remains explicitly unavailable for pause/resumption', state => {
    const h = render({ reader: { phase: 'ready', current: true, data: { ...pauseControlWire(), loaded: { state } } } });
    expect(document.body.textContent).toContain(h.copy.issues[state]); expect(document.querySelector('fieldset')).toBeNull(); expect(h.actions.preview).not.toHaveBeenCalled();
});
it('pending native work and extra precaution are separate restrictions; resumption stays disabled while adoption is reviewable', () => {
    const value = pauseControlWire(); if (value.loaded.state !== 'ready') throw new Error('fixture');
    const h = render({ reader: { phase: 'ready', current: true, data: { ...value, precaution: true, loaded: { state: 'ready', value: { ...value.loaded.value, emergency: true, tabs: [7] } } } } });
    expect(button(h.copy.resume).disabled).toBe(true); button(h.copy.adopt).click(); expect(h.actions.preview).toHaveBeenCalledExactlyOnceWith({ type: 'adopt-observed' }, 0);
});
it('a pending native mutation discloses its reservation and disables every new review without changing state', () => {
    const h = render({ reader: { phase: 'ready', current: true, data: { ...pauseControlWire(), pending: true } } });
    expect(document.body.textContent).toContain(h.copy.pending); expect(button(h.copy.pause).disabled).toBe(true);
});
it.each(['emergency', 'tab'] as const)('resume of %s requests only that scope and the observed revision', kind => {
    const value = pauseControlWire(); if (value.loaded.state !== 'ready') throw new Error('fixture');
    const h = render({ reader: { phase: 'ready', current: true, data: { ...value, loaded: { state: 'ready', value: { ...value.loaded.value, emergency: kind === 'emergency', tabs: kind === 'tab' ? [7] : [] } } } } });
    button(h.copy.resume).click(); expect(h.actions.preview).toHaveBeenCalledExactlyOnceWith(kind === 'emergency' ? { type: 'emergency', paused: false } : { type: 'tab', tabId: 7, paused: false }, 0);
});
it.each(['ready', 'unavailable', 'stale'] as const)('a %s candidate inventory preserves missing paused scopes, generic labels and independent availability copy', state => {
    const value = pauseControlWire(); if (value.loaded.state !== 'ready') throw new Error('fixture');
    const h = render({ reader: { phase: 'ready', current: true, data: { ...value, loaded: { state: 'ready', value: { ...value.loaded.value, tabs: [9] } }, targets: state === 'ready' ? { state, tabs: [], limited: true } : { state } } } });
    expect(document.querySelector('[data-native-pause-tab="9"]')?.textContent).toContain(h.copy.unavailableTab);
    expect(document.body.textContent).toContain(state === 'ready' ? h.copy.limited : h.copy.targetsUnavailable);
});
it('no matching local filter is distinct from a genuinely empty native candidate list and never sends a request', async () => {
    const h = render(); const input = document.getElementById('pause-tab-filter') as HTMLInputElement;
    input.value = 'no matches'; input.dispatchEvent(new Event('input', { bubbles: true })); flushSync(); expect(document.body.textContent).toContain(h.copy.noMatches); expect(h.actions.read).not.toHaveBeenCalled(); await h.close();
    const g = render({ reader: { phase: 'ready', current: true, data: { ...pauseControlWire(), targets: { state: 'ready', tabs: [], limited: false } } } }); expect(document.body.textContent).toContain(g.copy.empty);
});
it.each(['emergency', 'tab', 'adopt-observed'] as const)('a %s review exposes complete before/after scopes and routes exact confirmation/cancellation to its owner', kind => {
    const raw = pausePlanWire(kind); const plan = raw.target.kind === 'tab' ? { ...raw, target: { ...raw.target, label: null } } : raw;
    const h = render({ review: publicPauseReview(plan, 'preview') }); button(h.copy.confirm).click(); button(h.copy.cancel).click();
    expect(h.actions.confirm).toHaveBeenCalledOnce(); expect(h.actions.cancel).toHaveBeenCalledOnce(); expect(document.querySelectorAll('[data-pause-scopes]')).toHaveLength(2);
    expect(document.body.textContent).not.toContain(plan.operationId); expect(document.body.textContent).toContain(h.copy.before); expect(document.body.textContent).toContain(h.copy.after);
});
const outcomes: readonly PauseReviewOutcome[] = [
    { state: 'committed', revision: 1, acknowledgement: 'accepted', current: true }, { state: 'committed', revision: 1, acknowledgement: 'unknown', current: false },
    { state: 'reconciled', revision: 0, current: true }, { state: 'unknown', acknowledgement: 'accepted', observation: 'different', observedRevision: 0, current: true },
    { state: 'unknown', acknowledgement: 'unknown', observation: 'unavailable', observedRevision: null, current: false },
    { state: 'cancelled' }, { state: 'pending' }, { state: 'not-submitted' }, { state: 'conflict' }, { state: 'expired' }, { state: 'denied' },
];
it.each(outcomes)('a retained $state outcome keeps acknowledgement, canonical observation and source sample separate', outcome => {
    const h = render({ review: publicPauseReview(pausePlanWire(), outcome.state === 'unknown' ? 'unknown' : 'result', outcome), canInspect: true });
    const text = document.querySelector('[data-pause-review]')?.textContent; expect(text).toContain('current' in outcome ? pauseObservationCopy('en').results[outcome.state as 'committed'] : outcome.state === 'not-submitted' ? pauseObservationCopy('en').states.reviewed : outcome.state === 'pending' || outcome.state === 'cancelled' ? pauseObservationCopy('en').results[outcome.state] : h.copy.issues[outcome.state]);
    button(h.copy.inspect).click(); button(h.copy.dismiss).click(); expect(h.actions.inspect).toHaveBeenCalledOnce(); expect(h.actions.dismiss).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-pause-review] button')?.textContent).not.toBe(h.copy.confirm);
});
it('busy and inspection states cannot be mistaken for a completed result or dismissed in-flight operation', () => {
    const h = render({ review: publicPauseReview(pausePlanWire(), 'committing'), busy: true, checking: true, canInspect: true, issue: 'busy' });
    expect(button(h.copy.inspect).disabled).toBe(true); expect(button(h.copy.dismiss).disabled).toBe(true); expect(document.body.textContent).toContain(h.copy.issues.busy);
});
it('retired source purges plan labels, keeps scalar facts and offers no replay confirmation', () => {
    const h = render({ review: publicPauseReview(pausePlanWire(), 'stale', { state: 'committed', revision: 1, acknowledgement: 'accepted', current: false }) });
    expect(document.querySelector('[data-pause-scopes]')).toBeNull(); expect(button(h.copy.inspect).disabled).toBe(true); expect(document.body.textContent).toContain(h.copy.phases.stale);
});
it('live metadata replacement preserves the local filter focus, exposes changed counts and never invents an empty list for unavailable targets', () => {
    const h = render(); const input = document.getElementById('pause-tab-filter') as HTMLInputElement; input.focus(); input.value = '7'; input.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    h.update({ ...h.context, view: { ...h.context.view, reader: { phase: 'reading', current: false, data: null } } }); expect(document.activeElement).toBe(input); expect(input.value).toBe('7');
    const value = pauseControlWire(); h.update({ ...h.context, view: { ...h.context.view, reader: { phase: 'ready', current: true, data: { ...value, targets: { state: 'unavailable' } } } } });
    expect(document.body.textContent).toContain(h.copy.targetsUnavailable); expect(document.body.textContent).not.toContain(h.copy.empty); expect(input.value).toBe('7');
    h.update({ ...h.context, view: { ...h.context.view, reader: { phase: 'ready', current: true, data: value } } }); expect(document.querySelectorAll('[data-native-pause-tab]')).toHaveLength(1); expect(document.activeElement).toBe(input);
});
it('replacing an owned review updates complete live scope lists, localized explanatory copy and nullable safe target labels', () => {
    const raw = pausePlanWire('tab'); const h = render({ review: publicPauseReview(raw, 'preview') });
    const plan = { ...raw, before: { ...raw.before, tabs: [9] }, after: { ...raw.after, tabs: [7, 9] } };
    h.update({ ...h.context, center: { ...h.context.center, locale: 'es' }, view: { ...h.context.view, review: publicPauseReview(plan, 'preview') } });
    expect(document.querySelectorAll('[data-pause-scopes] li')).toHaveLength(3); expect(document.querySelector('[data-pause-review]')?.textContent).toContain('octo/example');
    h.update({ ...h.context, view: { ...h.context.view, review: publicPauseReview({ ...raw, target: { ...raw.target, kind: 'tab', tabId: 7, label: null } }, 'preview') } });
    expect(document.querySelectorAll('[data-pause-scopes] li')).toHaveLength(1); expect(document.querySelector('[data-pause-review]')?.textContent).not.toContain('octo/example');
});
