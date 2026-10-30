import { expect, it } from 'vitest';
import { nativePauseProvenance, type TemporaryPauseCondition } from '../../src/domain/temporary_pause_observation.ts';
import { DEFAULT_TEMPORARY_PAUSES, type TemporaryPauseLoad } from '../../src/domain/temporary_pauses.ts';
import { TemporaryPauseGuard } from '../../src/application/temporary_pause_guard.ts';

it.each(['pending', 'precaution', 'pending-precaution', 'unavailable'] as const)('%s worker restriction never claims that an uninspected native document is empty or an emergency pause', condition => {
    const raw = { condition, loaded: { state: 'ready', value: { ...DEFAULT_TEMPORARY_PAUSES, emergency: true, tabs: [7] } } } as const;
    const value = nativePauseProvenance(raw, 7); expect(value).toEqual({ worker: condition, native: 'not-checked', emergency: null, tab: null, restricted: true });
    expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(raw)).toBe(false); expect(Object.keys(value)).toEqual(['worker', 'native', 'emergency', 'tab', 'restricted']);
});
it.each(['future', 'corrupt', 'unavailable'] as const)('%s native storage has its own unavailable cause and cannot be called a user-selected pause', state => {
    expect(nativePauseProvenance({ condition: 'clear', loaded: { state } }, 7)).toEqual({ worker: 'clear', native: state, emergency: null, tab: null, restricted: true });
});
it.each([{ emergency: true, tabs: [7], tabId: 7, source: 'emergency', restricted: true },
    { emergency: false, tabs: [7], tabId: 7, source: 'tab', restricted: true },
    { emergency: false, tabs: [7], tabId: 9, source: 'none', restricted: false }])('native $source provenance reflects this exact native tab without disclosing other scopes', input => {
    const loaded: TemporaryPauseLoad = { state: 'ready', value: { ...DEFAULT_TEMPORARY_PAUSES, emergency: input.emergency, tabs: input.tabs } };
    expect(nativePauseProvenance({ condition: 'clear', loaded }, input.tabId)).toEqual({ worker: 'clear', native: input.source, emergency: input.emergency, tab: input.tabs.includes(input.tabId), restricted: input.restricted });
    expect(JSON.stringify(nativePauseProvenance({ condition: 'clear', loaded }, input.tabId))).not.toContain('tabId');
});
it.each([undefined, null, -1, 1.5, '7', NaN])('an unavailable native tab identity %s fails closed without inventing a scope', nativeTabId => {
    expect(nativePauseProvenance({ condition: 'clear', loaded: { state: 'ready', value: DEFAULT_TEMPORARY_PAUSES } }, nativeTabId)).toEqual({ worker: 'clear', native: 'unavailable', emergency: false, tab: null, restricted: true });
});
it('the worker snapshot distinguishes simultaneous pending work and earlier precaution without exposing private witnesses', () => {
    const guard = new TemporaryPauseGuard(); const observed: TemporaryPauseCondition[] = [guard.condition];
    const held = guard.hold()!; observed.push(guard.condition); guard.protect(); observed.push(guard.condition);
    guard.settle(held, false); observed.push(guard.condition); expect(guard.reconcile(guard.capture())).toBe(true); observed.push(guard.condition);
    expect(observed).toEqual(['clear', 'pending', 'pending-precaution', 'precaution', 'clear']);
});
