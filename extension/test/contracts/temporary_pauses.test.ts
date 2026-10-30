import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPORARY_PAUSES, copyTemporaryPauses, loadTemporaryPauses,
    planTemporaryPauseChange, temporaryPauseRestriction } from '../../src/domain/temporary_pauses.ts';

const before = () => ({ schemaVersion: 1, revision: 4, emergency: false, tabs: [3, 7] });
describe('closed browser-session pause document', () => {
    it('defaults only an actually absent native record, without freezing caller state', () => {
        expect(loadTemporaryPauses(undefined)).toEqual({ state: 'ready', value: DEFAULT_TEMPORARY_PAUSES });
        const value = before(); const loaded = copyTemporaryPauses(value)!;
        expect(loaded).toEqual(value); expect(Object.isFrozen(loaded.tabs)).toBe(true);
        expect(Object.isFrozen(value)).toBe(false); expect(Object.isFrozen(value.tabs)).toBe(false);
        value.tabs.push(9); expect(loaded.tabs).toEqual([3, 7]);
    });
    it('canonicalizes native tab IDs and property order without changing meaning', () => {
        expect(copyTemporaryPauses({ tabs: [7, 3], emergency: false, revision: 4, schemaVersion: 1 })).toEqual(before());
    });
    it('admits both native zero and the largest safe native ID', () => {
        expect(copyTemporaryPauses({ ...before(), tabs: [0, Number.MAX_SAFE_INTEGER] })?.tabs).toEqual([0, Number.MAX_SAFE_INTEGER]);
    });
    it('admits the exact 128-tab bound', () => {
        const tabs = Array.from({ length: 128 }, (_, i) => i);
        expect(copyTemporaryPauses({ ...before(), tabs })?.tabs).toEqual(tabs);
    });
    it.each([
        ['null is not an absent record', null], ['arrays are not documents', []],
        ['root extra fields', { ...before(), credential: 'not-authority' }],
        ['missing revision', { schemaVersion: 1, emergency: false, tabs: [] }],
        ['unsupported old version', { ...before(), schemaVersion: 0 }],
        ['fractional revision', { ...before(), revision: 0.1 }],
        ['negative revision', { ...before(), revision: -1 }],
        ['unsafe revision', { ...before(), revision: Number.MAX_SAFE_INTEGER + 1 }],
        ['nonboolean emergency', { ...before(), emergency: 1 }],
        ['nonarray tabs', { ...before(), tabs: {} }],
        ['duplicate tab IDs', { ...before(), tabs: [3, 3] }],
        ['negative tab ID', { ...before(), tabs: [-1] }],
        ['string tab ID', { ...before(), tabs: ['3'] }],
        ['fractional tab ID', { ...before(), tabs: [1.1] }],
        ['unsafe tab ID', { ...before(), tabs: [Number.MAX_SAFE_INTEGER + 1] }],
        ['too many tabs', { ...before(), tabs: Array.from({ length: 129 }, (_, i) => i) }],
        ['sparse array', { ...before(), tabs: Array(2) }],
        ['array extra key', { ...before(), tabs: Object.assign([3], { privateName: 'not-authority' }) }],
    ])('preserves malformed native input: %s', (_, value) => {
        expect(copyTemporaryPauses(value)).toBeNull(); expect(loadTemporaryPauses(value)).toEqual({ state: 'corrupt' });
        expect(temporaryPauseRestriction(loadTemporaryPauses(value), 3)).toEqual({ paused: true, source: 'unavailable' });
    });
    it('preserves a future document as unavailable rather than downgrading it', () => {
        const raw = { schemaVersion: 2, emergency: false, unknown: ['keep'] };
        expect(loadTemporaryPauses(raw)).toEqual({ state: 'future' });
        expect(raw).toEqual({ schemaVersion: 2, emergency: false, unknown: ['keep'] });
        expect(temporaryPauseRestriction(loadTemporaryPauses(raw), 3)).toEqual({ paused: true, source: 'unavailable' });
    });
    it('does not treat malformed or inherited future-version markers as a supported upgrade', () => {
        expect(loadTemporaryPauses({ ...before(), schemaVersion: 2.1 }).state).toBe('corrupt');
        expect(loadTemporaryPauses(Object.create({ schemaVersion: 2 })).state).toBe('corrupt');
    });
    it('revalidates a detached serializer result and preserves the authored input', () => {
        const value = before(); Object.defineProperty(value, 'toJSON', { value: () => ({ ...before(), emergency: 'false' }) });
        expect(copyTemporaryPauses(value)).toBeNull(); expect(Object.isFrozen(value)).toBe(false);
    });
    it('maps throwing native values to corrupt without executing a mutation', () => {
        const value = before(); Object.defineProperty(value, 'revision', { get: () => { throw new Error('native-read-failed'); } });
        expect(copyTemporaryPauses(value)).toBeNull(); expect(loadTemporaryPauses(value)).toEqual({ state: 'corrupt' });
    });
    it('preserves a native record whose version cannot be observed', () => {
        const value = before(); Object.defineProperty(value, 'schemaVersion', { get: () => { throw new Error('version-unavailable'); } });
        expect(loadTemporaryPauses(value)).toEqual({ state: 'corrupt' }); expect(Object.isFrozen(value)).toBe(false);
    });
    it('rejects a plain record whose serialized input exceeds the document budget', () => {
        const value = before(); Object.defineProperty(value, 'toJSON', { value: () => 'x'.repeat(16385) });
        expect(copyTemporaryPauses(value)).toBeNull();
    });
});
describe('revision-bound pause plans', () => {
    it('pauses a tab in numeric canonical order and leaves the original document intact', () => {
        const value = before(); const plan = planTemporaryPauseChange(value, { type: 'tab', tabId: 1, paused: true }, 4);
        expect(plan).toEqual({ state: 'ready', before: value, after: { ...value, revision: 5, tabs: [1, 3, 7] } });
        expect(value).toEqual(before()); expect(Object.isFrozen(value)).toBe(false);
        expect(plan.state === 'ready' && Object.isFrozen(plan.after.tabs)).toBe(true);
    });
    it('resumes only the named tab while preserving the emergency pause', () => {
        const value = { ...before(), emergency: true };
        const plan = planTemporaryPauseChange(value, { type: 'tab', tabId: 3, paused: false }, 4);
        expect(plan).toMatchObject({ state: 'ready', after: { emergency: true, tabs: [7] } });
    });
    it('releases only the emergency scope while keeping every tab pause', () => {
        expect(planTemporaryPauseChange({ ...before(), emergency: true }, { type: 'emergency', paused: false }, 4))
            .toMatchObject({ state: 'ready', after: { emergency: false, tabs: [3, 7] } });
    });
    it('sets emergency restriction without rewriting tab scopes', () => {
        expect(planTemporaryPauseChange(before(), { type: 'emergency', paused: true }, 4))
            .toMatchObject({ state: 'ready', after: { emergency: true, tabs: [3, 7] } });
    });
    it.each([
        { type: 'emergency', paused: false }, { type: 'tab', tabId: 3, paused: true }, { type: 'tab', tabId: 9, paused: false },
    ])('does not manufacture a write or revision for unchanged intent %j', intent => {
        expect(planTemporaryPauseChange(before(), intent, 4)).toEqual({ state: 'unchanged' });
    });
    it.each([
        null, {}, { type: 'all', paused: false }, { type: 'emergency', paused: 'false' },
        { type: 'emergency', paused: true, tabId: 3 }, { type: 'tab', paused: true },
        { type: 'tab', tabId: -1, paused: true }, { type: 'tab', tabId: 3, paused: true, connected: true },
    ])('rejects malformed or authority-bearing intent %j', intent => {
        expect(planTemporaryPauseChange(before(), intent, 4)).toEqual({ state: 'invalid', reason: 'invalid-input' });
    });
    it('rejects a malformed source document', () => {
        expect(planTemporaryPauseChange(null, { type: 'emergency', paused: true }, 4)).toEqual({ state: 'invalid', reason: 'invalid-input' });
    });
    it('requires a safe matching expected revision', () => {
        expect(planTemporaryPauseChange(before(), { type: 'emergency', paused: true }, -1)).toEqual({ state: 'invalid', reason: 'invalid-input' });
        expect(planTemporaryPauseChange(before(), { type: 'emergency', paused: true }, 3)).toEqual({ state: 'invalid', reason: 'conflict' });
    });
    it('bounds additions at capacity while allowing a current tab to resume', () => {
        const value = { ...before(), tabs: Array.from({ length: 128 }, (_, i) => i) };
        expect(planTemporaryPauseChange(value, { type: 'tab', tabId: 128, paused: true }, 4)).toEqual({ state: 'invalid', reason: 'capacity' });
        expect(planTemporaryPauseChange(value, { type: 'tab', tabId: 0, paused: false }, 4)).toMatchObject({ state: 'ready' });
    });
    it('preserves the last safe revision without overflow; unchanged remains inspectable', () => {
        const value = { ...before(), revision: Number.MAX_SAFE_INTEGER };
        expect(planTemporaryPauseChange(value, { type: 'emergency', paused: true }, value.revision)).toEqual({ state: 'invalid', reason: 'overflow' });
        expect(planTemporaryPauseChange(value, { type: 'emergency', paused: false }, value.revision)).toEqual({ state: 'unchanged' });
    });
    it('requires a fresh plan after any committed revision and never mutates a preview after caller edits', () => {
        const value = before(); const plan = planTemporaryPauseChange(value, { type: 'tab', tabId: 1, paused: true }, 4);
        expect(plan.state).toBe('ready'); if (plan.state !== 'ready') throw new Error('missing-plan');
        value.tabs.push(8); expect(plan.before.tabs).toEqual([3, 7]); expect(plan.after.tabs).toEqual([1, 3, 7]);
        expect(planTemporaryPauseChange(plan.after, { type: 'tab', tabId: 1, paused: true }, 4)).toEqual({ state: 'invalid', reason: 'conflict' });
    });
});
describe('restriction provenance without connection authority', () => {
    it('reports the highest active emergency scope', () => {
        expect(temporaryPauseRestriction(loadTemporaryPauses({ ...before(), emergency: true }), 3)).toEqual({ paused: true, source: 'emergency' });
    });
    it('keeps a tab pause local to that native tab', () => {
        expect(temporaryPauseRestriction(loadTemporaryPauses(before()), 3)).toEqual({ paused: true, source: 'tab' });
        expect(temporaryPauseRestriction(loadTemporaryPauses(before()), 9)).toEqual({ paused: false, source: 'none' });
    });
    it('never treats an unbound native tab ID as a resume grant', () => {
        expect(temporaryPauseRestriction(loadTemporaryPauses(undefined), undefined)).toEqual({ paused: true, source: 'unavailable' });
    });
    it('fails closed on an unavailable native observation', () => {
        expect(temporaryPauseRestriction({ state: 'unavailable' }, 3)).toEqual({ paused: true, source: 'unavailable' });
    });
});
