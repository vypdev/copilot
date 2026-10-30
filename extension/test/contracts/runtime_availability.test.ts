import { expect, it } from 'vitest';
import { runtimeAvailability } from '../../src/presentation/runtime_availability.ts';
import { runtimeCopy, statusText } from '../../src/presentation/runtime_copy.ts';
import { runtimeProvenanceCopy } from '../../src/presentation/runtime_provenance_copy.ts';
import { runtimeConfiguration } from '../../src/domain/runtime_configuration.ts';
import type { RuntimeConnectionFact } from '../../src/domain/runtime_provenance.ts';
import { validRuntimeConnection } from '../../src/domain/runtime_provenance_validation.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { CONFIG, clearNativeRestriction } from '../fixtures/page_configuration.ts';
import { CONNECTED } from '../fixtures/runtime.ts';
import { provenanceConfiguration } from '../fixtures/runtime_provenance.ts';

function connection(state: RuntimeConnectionFact['state'], retryAt: number | null = null) {
    const value = runtimeConfiguration({ ...DEFAULT_SETTINGS, repositories: { '7': { connected: true } } }, CONFIG, state === 'connected' ? CONNECTED : null, 9, clearNativeRestriction(), { state, retryAt });
    if (!value) throw new Error('invalid-connection-fixture'); return value;
}
it('a pending delivery cannot make earlier connected metadata readable, and a missing configuration remains unavailable', () => {
    const copy = runtimeCopy('en'); expect(runtimeAvailability(provenanceConfiguration(), true, true, 'en')).toEqual({ status: copy.pending, readable: false });
    expect(runtimeAvailability(null, true, true, 'en')).toEqual({ status: copy.pending, readable: false }); expect(runtimeAvailability(null, false, true, 'en')).toEqual({ status: copy.unavailable, readable: false });
});
it.each(['pending', 'precaution', 'pending-precaution', 'unavailable'] as const)('a %s worker never becomes readable just because the connection itself is verified', condition => {
    expect(runtimeAvailability(provenanceConfiguration(condition), false, true, 'en')).toEqual({ status: runtimeProvenanceCopy('en').restricted, readable: false });
});
it('saved/native pauses and offline status independently restrict the activity control without changing native or profile facts', () => {
    for (const value of [provenanceConfiguration('clear', true), provenanceConfiguration('clear', false, true), provenanceConfiguration('clear', false, false, true)]) {
        const before = JSON.stringify(value); expect(runtimeAvailability(value, false, true, 'en').readable).toBe(false); expect(JSON.stringify(value)).toBe(before);
    }
    expect(runtimeAvailability(provenanceConfiguration(), false, false, 'en')).toEqual({ status: runtimeCopy('en').offline, readable: false });
    expect(runtimeAvailability(provenanceConfiguration(), false, true, 'en')).toEqual({ status: runtimeCopy('en').connected, readable: true });
});
it('a connected read session belonging to a different page is unavailable for that page without being falsely described as disconnected', () => {
    const value = runtimeConfiguration({ ...DEFAULT_SETTINGS, repositories: { '7': { connected: true } } }, { ...CONFIG, viewer: 'other' }, CONNECTED, 9, clearNativeRestriction())!;
    expect(runtimeAvailability(value, false, true, 'en')).toEqual({ status: runtimeCopy('en').scopeUnavailable, readable: false });
});
it.each(['disconnected', 'unavailable', 'revalidating'] as const)('the %s connection dependency has its own local status without an implicit read', state => {
    const expected = { disconnected: runtimeCopy('en').standalone, unavailable: runtimeCopy('en').unavailable, revalidating: runtimeCopy('en').pending };
    expect(runtimeAvailability(connection(state), false, true, 'en')).toEqual({ status: expected[state], readable: false });
});
it.each(['limited', 'cooldown', 'budget'] as const)('%s restoration without a known future deadline remains waiting rather than falsely disconnected', state => {
    for (const deadline of [null, 0, 1000]) expect(runtimeAvailability(connection(state, deadline), false, true, 'en', 1000)).toEqual({ status: runtimeCopy('en').wait, readable: false });
    expect(runtimeAvailability(connection(state, 2000), false, true, 'en', 1000)).toEqual({ status: runtimeCopy('en').retry.replace('{time}', new Date(2000).toLocaleString('en')), readable: false });
});
it.each(['en', 'es', 'fr', 'pt'])('the %s current connection deadline and offline copy are localized without exposing credentials or provider output', locale => {
    const value = runtimeAvailability(connection('limited', 2000), false, true, locale, 1000);
    expect(value.status).toBe(runtimeCopy(locale).retry.replace('{time}', new Date(2000).toLocaleString(locale)));
    expect(runtimeAvailability(provenanceConfiguration(), false, false, locale).status).toBe(runtimeCopy(locale).offline); expect(Object.isFrozen(value)).toBe(true);
});
it.each([null, [], {}, { state: 'connected' }, { state: 'writer', retryAt: null }, { state: 'limited', retryAt: -1 }, { state: 'limited', retryAt: 1.5 },
    { state: 'budget', retryAt: 8640000000000001 }, { state: 'connected', retryAt: 1 }, { state: 'disconnected', retryAt: 1 }, { state: 'limited', retryAt: 10, token: 'private' }].map(value => ({ value })))('a malformed or private connection dependency $value is not a usable fact', ({ value }) => { expect(validRuntimeConnection(value)).toBe(false); });
it('invalid locale tags use safe fallback copy and a bounded ISO deadline instead of throwing or exposing the locale error', () => {
    expect(runtimeCopy('constructor')).toBe(runtimeCopy('en')); expect(runtimeProvenanceCopy('constructor')).toBe(runtimeProvenanceCopy('en'));
    expect(runtimeCopy('fr_FR')).toBe(runtimeCopy('fr')); expect(runtimeProvenanceCopy('es_ES')).toBe(runtimeProvenanceCopy('es'));
    expect(statusText('limited', runtimeCopy('en'), 2000, 1000, 'invalid_locale_$')).toBe(runtimeCopy('en').retry.replace('{time}', new Date(2000).toISOString()));
});
