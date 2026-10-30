import { DEFAULT_SETTINGS, type Settings } from '../../src/domain/settings.ts';
import { resolveProfile, type ProfileContext } from '../../src/domain/profile_resolution.ts';
import type { CenterProfile, ProfileScope } from '../../src/domain/center_profiles.ts';
import { runtimeConfiguration } from '../../src/domain/runtime_configuration.ts';
import { nativePauseProvenance, type TemporaryPauseCondition } from '../../src/domain/temporary_pause_observation.ts';
import { DEFAULT_TEMPORARY_PAUSES } from '../../src/domain/temporary_pauses.ts';
import { CONNECTED } from './runtime.ts';
import { CONFIG } from './page_configuration.ts';

export const PROVENANCE_CONTEXT: ProfileContext = { host: 'github.com', accountId: '1', organizationId: '11', repositoryId: '7', sessionEpoch: 9 };
const scopes: readonly ProfileScope[] = [{ kind: 'global' }, { kind: 'host', host: 'github.com' }, { kind: 'account', host: 'github.com', accountId: '1' },
    { kind: 'organization', host: 'github.com', accountId: '1', organizationId: '11' }, { kind: 'repository', host: 'github.com', accountId: '1', repositoryId: '7' }];
export function preferenceProvenanceFixture() {
    const profiles: CenterProfile[] = scopes.map(scope => ({ id: `private-${scope.kind}`, name: `PRIVATE local ${scope.kind} name`, scope,
        preferences: { paused: true, density: 'compact', shortcuts: true, features: { 'BEX-NAV-01': false } } }));
    const settings: Settings = { ...DEFAULT_SETTINGS, paused: true, repositories: { '7': { paused: true, connected: true } },
        center: { ...DEFAULT_SETTINGS.center, profiles, selected: profiles.map(profile => profile.id) } };
    const resolved = resolveProfile(settings, settings.repositories['7'], settings.center, PROVENANCE_CONTEXT,
        { accountId: '1', repositoryId: '7', epoch: 9, preferences: { paused: true } });
    return { settings, resolved, context: PROVENANCE_CONTEXT, profiles };
}
export function provenanceConfiguration(condition: TemporaryPauseCondition = 'clear', emergency = false, tab = false, global = false) {
    const native = nativePauseProvenance({ condition, loaded: { state: 'ready', value: { ...DEFAULT_TEMPORARY_PAUSES, emergency, tabs: tab ? [1] : [] } } }, 1);
    const settings = { ...DEFAULT_SETTINGS, paused: global, repositories: { '7': { connected: true } } };
    const configuration = runtimeConfiguration(settings, CONFIG, CONNECTED, 9, { native, claimedRepository: false, retainedScope: false, session: { worker: 'clear', native: 'ready', scope: 'empty', restricted: false } });
    if (!configuration) throw new Error('invalid-provenance-fixture'); return configuration;
}
