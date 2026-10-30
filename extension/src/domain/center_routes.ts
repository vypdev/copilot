import { FEATURE_DEFAULTS } from './feature_defaults.ts';
import { keys, record } from './value.ts';

export const CENTER_ROUTES = Object.freeze(['overview', 'features', 'profiles', 'repositories', 'connections',
    'copilot', 'setup', 'work', 'attention', 'activity', 'privacy', 'data', 'diagnostics', 'appearance',
    'language', 'shortcuts', 'welcome', 'help', 'about', 'recovery'] as const);
export type CenterRoute = typeof CENTER_ROUTES[number];
export type CenterLocation = { readonly route: CenterRoute; readonly detail?: string };
export const localIdentifier = (value: unknown): value is string => typeof value === 'string'
    && /^[a-z][a-z0-9-]{0,47}$(?![\s\S])/u.test(value);

/** Only fixed local destinations and known opaque IDs may enter navigation. */
export function parseCenterLocation(hash: string): CenterLocation | null {
    if (hash === '' || hash === '#') return Object.freeze({ route: 'overview' });
    if (hash.length > 128) return null;
    const match = /^#\/([a-z]+)(?:\/([A-Za-z0-9-]+))?$(?![\s\S])/u.exec(hash);
    if (!match || !CENTER_ROUTES.includes(match[1] as CenterRoute)) return null;
    const route = match[1] as CenterRoute;
    const detail = match[2];
    if (detail === undefined) return Object.freeze({ route });
    if (!(route === 'features' && Object.hasOwn(FEATURE_DEFAULTS, detail))
        && !(route === 'profiles' && localIdentifier(detail)) && !(route === 'repositories' && ['workspaces', 'pauses'].includes(detail))) return null;
    return Object.freeze({ route, detail });
}

/** Validate even programmatic destinations; no caller-supplied URL is forwarded. */
export function centerLocationHash(value: unknown): string | null {
    if (!record(value) || !keys(value, ['route', 'detail']) || typeof value.route !== 'string'
        || (value.detail !== undefined && typeof value.detail !== 'string')) return null;
    const hash = `#/${value.route}${value.detail === undefined ? '' : `/${value.detail}`}`;
    return parseCenterLocation(hash) ? hash : null;
}
