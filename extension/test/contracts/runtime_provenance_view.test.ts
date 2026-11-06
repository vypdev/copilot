import { expect, it } from 'vitest';
import { runtimeProvenanceView } from '../../src/presentation/runtime_provenance_view.ts';
import { runtimeProvenanceCopy } from '../../src/presentation/runtime_provenance_copy.ts';
import { runtimeCopy, statusText } from '../../src/presentation/runtime_copy.ts';
import { runtimeConfiguration } from '../../src/domain/runtime_configuration.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { CONNECTED } from '../fixtures/runtime.ts';
import { CONFIG, clearNativeRestriction } from '../fixtures/page_configuration.ts';

it.each(['claimedRepository', 'retainedScope'] as const)('the %s restriction and offline network retain their own labels rather than inventing a native emergency', cause => {
    const configuration = runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, null, 0, { ...clearNativeRestriction(), [cause]: true })!;
    const copy = runtimeProvenanceCopy('en'); const view = runtimeProvenanceView(configuration, 'en', false);
    expect(view.rows).toContainEqual({ label: cause === 'claimedRepository' ? copy.claimed : copy.retained, value: copy.yes });
    expect(view.rows).toContainEqual({ label: copy.network, value: copy.offline }); expect(view.rows).toContainEqual({ label: copy.emergency, value: copy.no });
    expect(view.rows).toContainEqual({ label: copy.connection, value: runtimeCopy('en').standalone });
});
it('a waiting connection retains a separately localized deadline and the read-result offline status is explicit', () => {
    const connection = { state: 'budget', retryAt: 2100000000000 } as const;
    const configuration = runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, null, 0, clearNativeRestriction(), connection)!;
    expect(runtimeProvenanceView(configuration, 'es').rows).toContainEqual({ label: runtimeProvenanceCopy('es').connection, value: statusText('budget', runtimeCopy('es'), connection.retryAt, undefined, 'es') });
    expect(statusText('offline', runtimeCopy('es'))).toBe(runtimeCopy('es').offline);
});
it('the public factory rejects contradictory identity/connection facts and invalid numeric deadlines before constructing a usable response', () => {
    expect(runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, CONNECTED, 0, clearNativeRestriction(), { state: 'disconnected', retryAt: null })).toBeNull();
    expect(runtimeConfiguration(DEFAULT_SETTINGS, CONFIG, null, 0, clearNativeRestriction(), { state: 'budget', retryAt: -1 })).toBeNull();
});
it('an unknown feature from a structurally typed settings caller cannot escape as a public preference source', () => {
    const settings = { ...DEFAULT_SETTINGS, features: { ...DEFAULT_SETTINGS.features, 'unknown-future-feature': true } };
    expect(runtimeConfiguration(settings, CONFIG, null, 0, clearNativeRestriction())).toBeNull();
});
