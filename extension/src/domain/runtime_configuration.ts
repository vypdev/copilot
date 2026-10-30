import { pageIdentity } from './page.ts';
import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { resolveProfile, type ProfileContext } from './profile_resolution.ts';
import type { SessionIdentity } from './session.ts';
import type { Settings } from './settings.ts';
import type { Message } from './protocol.ts';
import { deepFreeze, jsonBytesWithin, keys, natural, record } from './value.ts';
import { validCenterBindings, type CenterBinding } from './shortcuts.ts';
import { runtimePreferenceProvenance } from './runtime_preference_provenance.ts';
import { UNAVAILABLE_RUNTIME_RESTRICTION, runtimeIsPaused, type RuntimeProvenance, type RuntimeRestriction, type RuntimeConnectionFact } from './runtime_provenance.ts';
import { validRuntimeProvenance } from './runtime_provenance_validation.ts';
import { decodeHistoryValue } from './history_decode.ts';

export type PageRequest = Extract<Message, { method: 'page.snapshot' | 'page.configuration' }>;
export type RuntimeSettings = Pick<Settings, 'revision' | 'locale' | 'theme' | 'density' | 'shortcuts' | 'features' | 'paused'> & { readonly bindings: readonly CenterBinding[] };
export interface RuntimeConfiguration {
    readonly state: 'ready'; readonly route: string; readonly generation: number; readonly repositoryId: string;
    readonly viewer: string | null; readonly epoch: number; readonly connected: boolean; readonly settings: RuntimeSettings;
    readonly provenance: RuntimeProvenance;
}
/** Page observations can veto a verified identity; they cannot create one. */
export function pageProfileContext(message: PageRequest, identity: SessionIdentity | null): ProfileContext {
    const account = identity && message.viewer?.toLowerCase() === identity.viewerLogin.toLowerCase() ? identity : null;
    const repository = account && message.repositoryId === account.repositoryId
        && pageIdentity(message.route)!.repository === account.repository.toLowerCase() ? account : null;
    return { host: 'github.com', accountId: account?.viewerId ?? null, organizationId: repository?.organizationId ?? null,
        repositoryId: repository?.repositoryId ?? null, sessionEpoch: null };
}
export function runtimeConfiguration(settings: Settings, message: PageRequest, identity: SessionIdentity | null, epoch: number,
    restriction: RuntimeRestriction = UNAVAILABLE_RUNTIME_RESTRICTION, connection: RuntimeConnectionFact = { state: identity ? 'connected' : 'disconnected', retryAt: null }): RuntimeConfiguration | null {
    if (identity && connection.state !== 'connected') return null;
    const context = pageProfileContext(message, identity);
    const resolved = resolveProfile(settings, context.repositoryId ? settings.repositories[context.repositoryId] : undefined,
        settings.center, context);
    const preferences = runtimePreferenceProvenance(settings, context, resolved);
    if (!preferences) return null;
    const provenance = { preferences, restriction: { ...restriction, native: { ...restriction.native } }, connection: { ...connection } }; const paused = runtimeIsPaused(provenance);
    const connected = connection.state === 'connected' && !paused && context.repositoryId !== null && settings.repositories[context.repositoryId]?.connected === true;
    if (!validRuntimeProvenance(provenance, paused, connected)) return null;
    return deepFreeze({ state: 'ready', route: message.route, generation: message.generation, repositoryId: message.repositoryId,
        viewer: message.viewer, epoch, connected, provenance,
        settings: { revision: settings.revision, locale: settings.locale, theme: settings.theme, density: resolved.density,
            shortcuts: resolved.shortcuts, features: resolved.features, paused, bindings: settings.center.bindings.map(binding => ({ command: binding.command, binding: binding.binding })) } });
}
/** Closed source/route/identity receipt; only four bounded bindings, never profile/favorite/session collections. */
function validConfiguration(value: unknown, request: PageRequest, sourceTree: string): value is RuntimeConfiguration & { readonly sourceTree: string } {
    if (!record(value) || !keys(value, ['state', 'route', 'generation', 'repositoryId', 'viewer', 'epoch', 'connected', 'settings', 'sourceTree', 'provenance'])
        || Object.keys(value).length !== 10 || value.sourceTree !== sourceTree || value.state !== 'ready' || value.route !== request.route
        || value.generation !== request.generation || value.repositoryId !== request.repositoryId || value.viewer !== request.viewer
        || !natural(value.epoch) || typeof value.connected !== 'boolean' || !record(value.settings) || !jsonBytesWithin(value, 32768)) return false;
    const settings = value.settings;
    if (!keys(settings, ['revision', 'locale', 'theme', 'density', 'shortcuts', 'features', 'paused', 'bindings']) || Object.keys(settings).length !== 8
        || !natural(settings.revision) || !['auto', 'en', 'es', 'fr', 'pt'].includes(settings.locale as string)
        || !['github', 'light', 'dark'].includes(settings.theme as string) || !['comfortable', 'compact'].includes(settings.density as string)
        || typeof settings.shortcuts !== 'boolean' || typeof settings.paused !== 'boolean' || (settings.paused && value.connected)
        || !validCenterBindings(settings.bindings) || !record(settings.features) || Object.keys(settings.features).length !== Object.keys(FEATURE_DEFAULTS).length
        || !Object.entries(settings.features).every(([id, enabled]) => Object.hasOwn(FEATURE_DEFAULTS, id) && typeof enabled === 'boolean')) return false;
    return validRuntimeProvenance(value.provenance, settings.paused, value.connected);
}
export function decodeRuntimeConfiguration(value: unknown, request: PageRequest, sourceTree: string): RuntimeConfiguration | null {
    const copied = decodeHistoryValue(value, (value): value is RuntimeConfiguration & { readonly sourceTree: string } => validConfiguration(value, request, sourceTree));
    if (!copied) return null;
    const { sourceTree: _source, ...configuration } = copied;
    return deepFreeze(configuration);
}
