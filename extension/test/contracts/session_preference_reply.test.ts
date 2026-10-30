import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { sessionPreferenceReplyFixture } from '../fixtures/session_preference_reply.ts';
import { decodeSessionPreferenceRead, decodeSessionPreferencePreview, decodeSessionPreferenceOutcome, validSessionPreferenceFacts, sessionPreferenceOutcomeMatches } from '../../src/domain/session_preference_reply.ts';

let h: Awaited<ReturnType<typeof sessionPreferenceReplyFixture>>;
function at(value: unknown, ...path: string[]): Record<string, unknown> {
    let current = value; for (const key of path) current = (current as Record<string, unknown>)[key]; return current as Record<string, unknown>;
}
beforeAll(async () => { h = await sessionPreferenceReplyFixture(); });
afterAll(() => { h?.stop(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('actual emitter read, preview and result are detached, closed and consistent through the private transport', () => {
    const read = decodeSessionPreferenceRead(h.read); const plan = decodeSessionPreferencePreview(h.preview); const outcome = decodeSessionPreferenceOutcome(h.result);
    expect(read?.settingsRevision).toEqual(expect.any(Number)); expect(plan?.state).toBe('preview'); expect(outcome).toMatchObject({ state: 'result', facts: { attempt: 'submitted' }, outcome: { state: 'committed' } });
    expect(Object.isFrozen(h.read)).toBe(false); expect(Object.isFrozen(read?.source)).toBe(true);
    if (plan?.state !== 'preview' || !outcome) throw new Error('fixture-decoder-unavailable'); expect(sessionPreferenceOutcomeMatches(plan, outcome)).toBe(true);
    expect(sessionPreferenceOutcomeMatches(plan, { state: 'result', facts: { attempt: 'unobserved', acknowledgement: null, observation: null }, outcome: { state: 'reconciled', revision: 0, current: true } })).toBe(false);
});
it.each(['extra', 'private-source', 'private-native-document', 'missing-feature', 'false-pause', 'incompatible-revision', 'unknown-context', 'inactive-effective', 'fabricated-session-source'] as const)('the %s read cannot promote a contradictory or private native DTO', kind => {
    const value = structuredClone(h.read) as Record<string, unknown>;
    if (kind === 'extra') value.secret = 'private'; if (kind === 'private-source') at(value, 'source').secret = 'private';
    if (kind === 'private-native-document') at(value, 'loaded', 'value', 'preferences').grant = true;
    if (kind === 'missing-feature') delete at(value, 'effective', 'features')['BEX-NAV-01'];
    if (kind === 'false-pause') value.restriction = { paused: true, reason: 'session' };
    if (kind === 'incompatible-revision') value.settingsRevision = -1;
    if (kind === 'unknown-context') at(value, 'source', 'context').verified = 'yes';
    if (kind === 'inactive-effective') value.source = { state: 'unavailable' };
    if (kind === 'fabricated-session-source') at(value, 'effective', 'sources').density = 'session';
    expect(decodeSessionPreferenceRead(value)).toBeNull();
});
it.each(['private', 'revision', 'empty-native-scope', 'authority-source', 'inherited-pause', 'scope-null-pause', 'missing-setting-revision', 'wrong-effective-density', 'unrequested-feature-source', 'false-session-pause'] as const)('the %s preview is rejected before a reusable operation selector can be retained', kind => {
    const value = structuredClone(h.preview) as Record<string, unknown>;
    if (kind === 'private') value.witness = {}; if (kind === 'revision') at(value, 'after').revision = 9;
    if (kind === 'empty-native-scope') at(value, 'after').scope = null;
    if (kind === 'authority-source') at(value, 'effectiveAfter', 'sources').density = 'write-approval';
    if (kind === 'inherited-pause') { at(value, 'effectiveAfter').pauseSources = ['global', 'session']; at(value, 'effectiveAfter', 'sources').paused = 'session'; }
    if (kind === 'scope-null-pause') value.restrictionBefore = { paused: true, reason: 'unknown' };
    if (kind === 'missing-setting-revision') delete value.settingsRevision;
    if (kind === 'wrong-effective-density') at(value, 'effectiveAfter').density = 'comfortable';
    if (kind === 'unrequested-feature-source') at(value, 'effectiveAfter', 'sources', 'features')['BEX-NAV-01'] = 'session';
    if (kind === 'false-session-pause') at(value, 'after', 'preferences').paused = false;
    expect(decodeSessionPreferencePreview(value)).toBeNull();
});
it.each([null, {}, { attempt: 'unobserved', acknowledgement: 'accepted', observation: null }, { attempt: 'submitted', acknowledgement: null, observation: 'committed' },
    { attempt: 'submitted', acknowledgement: true, observation: null }, { attempt: 'submitted', acknowledgement: 'accepted', observation: 'committed', token: 'private' }].map(value => ({ value })))('a fabricated native fact $value cannot assert acknowledgement or observation without its prerequisite', ({ value }) => {
    expect(validSessionPreferenceFacts(value)).toBe(false); expect(decodeSessionPreferenceOutcome({ state: 'pending', facts: value })).toBeNull();
});
it('a committed outcome requires its actual native facts, while operation issues cannot acquire secret payloads', () => {
    const value = structuredClone(h.result) as Record<string, unknown>; at(value, 'facts').attempt = 'unobserved'; at(value, 'facts').acknowledgement = null; at(value, 'facts').observation = null;
    expect(decodeSessionPreferenceOutcome(value)).toBeNull(); expect(decodeSessionPreferenceOutcome({ state: 'expired', source: 'private' })).toBeNull();
    expect(decodeSessionPreferenceOutcome({ state: 'expired' })).toEqual({ state: 'expired' }); expect(decodeSessionPreferencePreview({ state: 'invalid', reason: 'invalid-input' })).toEqual({ state: 'invalid', reason: 'invalid-input' });
});
it('an unknown outcome cannot contradict separately observed native acknowledgement or readback facts', () => {
    const value = { state: 'result', outcome: { state: 'unknown', acknowledgement: 'accepted', observation: 'different', observedRevision: 0, current: true },
        facts: { attempt: 'submitted', acknowledgement: 'accepted', observation: 'different' } };
    expect(decodeSessionPreferenceOutcome(value)).not.toBeNull();
    for (const patch of [{ acknowledgement: 'unknown' }, { observation: 'unavailable' }]) expect(decodeSessionPreferenceOutcome({ ...value, outcome: { ...value.outcome, ...patch } })).toBeNull();
    expect(decodeSessionPreferenceOutcome({ ...value, facts: { attempt: 'unobserved', acknowledgement: null, observation: null } })).not.toBeNull();
});
it.each(['future', 'corrupt', 'unavailable'] as const)('a %s native read is a preserved unavailable record rather than invented effective defaults', state => {
    const value = { ...h.read, loaded: { state }, effective: null, restriction: { paused: true, reason: 'unknown' } };
    expect(decodeSessionPreferenceRead(value)).toMatchObject({ loaded: { state }, effective: null });
});
it.each(['malformed-ready', 'unknown-state', 'unknown-organization'] as const)('the %s read cannot become a usable native source', kind => {
    const value = structuredClone(h.read);
    if (kind === 'malformed-ready') value.loaded = { state: 'ready', value: {} };
    if (kind === 'unknown-state') value.loaded = { state: 'invented' };
    if (kind === 'unknown-organization') at(value, 'source').organizationId = '0';
    expect(decodeSessionPreferenceRead(value)).toBeNull();
});
it.each(['invalid-restriction', 'unknown-restriction', 'contradictory-restriction', 'missing-source', 'missing-saved-revision', 'unverified-replace', 'unknown-action', 'unreviewed-precaution', 'clear-with-active-override'] as const)('a %s preview cannot convey an actionable retained review', kind => {
    const value = structuredClone(h.preview);
    if (kind === 'invalid-restriction') value.restrictionAfter = { paused: 'yes', reason: 'session' };
    if (kind === 'unknown-restriction') value.restrictionAfter = { paused: true, reason: 'invented' };
    if (kind === 'contradictory-restriction') value.restrictionAfter = { paused: false, reason: 'session' };
    if (kind === 'missing-source') value.source = null;
    if (kind === 'missing-saved-revision') value.settingsRevision = null;
    if (kind === 'unverified-replace') { value.source = null; value.effectiveBefore = null; value.effectiveAfter = null; }
    if (kind === 'unknown-action') value.action = 'grant-access';
    if (kind === 'unreviewed-precaution') value.precautionBefore = true;
    if (kind === 'clear-with-active-override') value.action = 'clear';
    expect(decodeSessionPreferencePreview(value)).toBeNull();
});
