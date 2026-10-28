import { pageIdentity } from './page.ts';
import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { resolveProfile, type ProfileContext } from './profile_resolution.ts';
import type { SessionIdentity } from './session.ts';
import type { Settings } from './settings.ts';
import type { Message } from './protocol.ts';
import { deepFreeze, jsonBytesWithin, keys, natural, record } from './value.ts';

export type PageRequest = Extract<Message, { method: 'page.snapshot' | 'page.configuration' }>;
export type RuntimeSettings = Pick<Settings, 'revision' | 'locale' | 'theme' | 'density' | 'shortcuts' | 'features' | 'paused'>;
export interface RuntimeConfiguration {
    readonly state: 'ready'; readonly route: string; readonly generation: number; readonly repositoryId: string;
    readonly viewer: string | null; readonly epoch: number; readonly connected: boolean; readonly settings: RuntimeSettings;
}
/** Page observations can veto a verified identity; they cannot create one. */
export function pageProfileContext(message: PageRequest, identity: SessionIdentity | null): ProfileContext {
    const account = identity && message.viewer?.toLowerCase() === identity.viewerLogin.toLowerCase() ? identity : null;
    const repository = account && message.repositoryId === account.repositoryId
        && pageIdentity(message.route)!.repository === account.repository.toLowerCase() ? account : null;
    return { host: 'github.com', accountId: account?.viewerId ?? null, organizationId: repository?.organizationId ?? null,
        repositoryId: repository?.repositoryId ?? null, sessionEpoch: null };
}
export function runtimeConfiguration(settings: Settings, message: PageRequest, identity: SessionIdentity | null, epoch: number, restricted = false): RuntimeConfiguration {
    const context = pageProfileContext(message, identity);
    const resolved = resolveProfile(settings, context.repositoryId ? settings.repositories[context.repositoryId] : undefined,
        settings.center, context, undefined, false, restricted);
    return deepFreeze({ state: 'ready', route: message.route, generation: message.generation, repositoryId: message.repositoryId,
        viewer: message.viewer, epoch, connected: !resolved.paused && context.repositoryId !== null && settings.repositories[context.repositoryId]?.connected === true,
        settings: { revision: settings.revision, locale: settings.locale, theme: settings.theme, density: resolved.density,
            shortcuts: resolved.shortcuts, features: resolved.features, paused: resolved.paused } });
}
/** Closed source/route/identity receipt; personal collections never enter content. */
export function decodeRuntimeConfiguration(value: unknown, request: PageRequest, sourceTree: string): RuntimeConfiguration | null {
    if (!record(value) || !keys(value, ['state', 'route', 'generation', 'repositoryId', 'viewer', 'epoch', 'connected', 'settings', 'sourceTree'])
        || Object.keys(value).length !== 9 || value.sourceTree !== sourceTree || value.state !== 'ready' || value.route !== request.route
        || value.generation !== request.generation || value.repositoryId !== request.repositoryId || value.viewer !== request.viewer
        || !natural(value.epoch) || typeof value.connected !== 'boolean' || !record(value.settings) || !jsonBytesWithin(value, 32768)) return null;
    const settings = value.settings;
    if (!keys(settings, ['revision', 'locale', 'theme', 'density', 'shortcuts', 'features', 'paused']) || Object.keys(settings).length !== 7
        || !natural(settings.revision) || !['auto', 'en', 'es', 'fr', 'pt'].includes(settings.locale as string)
        || !['github', 'light', 'dark'].includes(settings.theme as string) || !['comfortable', 'compact'].includes(settings.density as string)
        || typeof settings.shortcuts !== 'boolean' || typeof settings.paused !== 'boolean' || (settings.paused && value.connected)
        || !record(settings.features) || Object.keys(settings.features).length !== Object.keys(FEATURE_DEFAULTS).length
        || !Object.entries(settings.features).every(([id, enabled]) => Object.hasOwn(FEATURE_DEFAULTS, id) && typeof enabled === 'boolean')) return null;
    const { sourceTree: _source, ...configuration } = value;
    return deepFreeze(JSON.parse(JSON.stringify(configuration)) as RuntimeConfiguration);
}
