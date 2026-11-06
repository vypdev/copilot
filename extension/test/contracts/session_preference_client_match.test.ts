import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { sessionPreferenceReplyFixture } from '../fixtures/session_preference_reply.ts';
import { decodeSessionPreferenceRead, decodeSessionPreferencePreview } from '../../src/domain/session_preference_reply.ts';
import { sessionPreferencePreviewMatches as matches } from '../../src/domain/session_preference_client_match.ts';
import { planSessionPreferences, sessionPreferenceRestriction } from '../../src/domain/session_preferences.ts';
import type { SessionPreferenceRead } from '../../src/domain/session_preference_read.ts';
import type { SessionPreferenceReviewPlan } from '../../src/domain/session_preference_review.ts';

let h: Awaited<ReturnType<typeof sessionPreferenceReplyFixture>>; let read: SessionPreferenceRead; let plan: SessionPreferenceReviewPlan;
beforeAll(async () => { h = await sessionPreferenceReplyFixture(); const r = decodeSessionPreferenceRead(h.read); const p = decodeSessionPreferencePreview(h.preview);
    if (!r || p?.state !== 'preview') throw new Error('fixture-native-wire'); read = r; plan = p; });
afterAll(() => { h?.stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const intent = { type: 'replace', preferences: { density: 'compact', paused: true } } as const;
it.each(['unknown-native', 'pending-native', 'different-revision', 'different-intent', 'different-source-label'] as const)('the %s metadata/plan cannot become the current authored review', kind => {
    expect(matches(kind === 'different-source-label' ? { ...plan, source: { ...plan.source!, name: 'Other' } } : plan,
        kind === 'different-intent' ? { type: 'clear' } : intent,
        kind === 'unknown-native' ? { ...read, loaded: { state: 'future' } } : kind === 'pending-native' ? { ...read, pending: true } : read,
        kind === 'different-revision' ? 1 : 0)).toBe(false);
});
it.each(['unavailable', 'retained'] as const)('an explicit clear can match a known native document with %s ownership without inventing an enabling context', state => {
    const context = state === 'retained' && read.source?.state === 'ready' ? { ...read.source.context, verified: false } : null;
    const source = context && read.source?.state === 'ready' ? { ...read.source, context } : { state: 'unavailable' as const };
    const before = plan.after; const change = planSessionPreferences(before, null, { type: 'clear' }, 1); if (change.state !== 'ready') throw new Error('fixture-clear');
    const restrictionBefore = sessionPreferenceRestriction({ state: 'ready', value: before }, context); const restrictionAfter = sessionPreferenceRestriction({ state: 'ready', value: change.after }, context);
    const current: SessionPreferenceRead = { ...read, loaded: { state: 'ready', value: before }, source, settingsState: 'unavailable', settingsRevision: null, effective: null, restriction: restrictionBefore };
    const clear: SessionPreferenceReviewPlan = { ...plan, action: 'clear', revision: 1, settingsRevision: null, before, after: change.after,
        source: null, effectiveBefore: null, effectiveAfter: null, restrictionBefore, restrictionAfter };
    expect(matches(clear, { type: 'clear' }, current, 1)).toBe(true);
});
