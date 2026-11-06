import { deepFreeze } from './value.ts';

export const BROWSER_CAPABILITIES = ['local-storage', 'github-pages', 'github-api'] as const;
export type BrowserCapability = typeof BROWSER_CAPABILITIES[number];
export type PermissionGrant = 'granted' | 'not-granted' | 'unknown' | 'unsupported';
export interface PermissionQuery { readonly permissions?: readonly string[]; readonly origins?: readonly string[] }
const queries: Readonly<Record<BrowserCapability, PermissionQuery>> = deepFreeze({
    'local-storage': { permissions: ['storage'] },
    'github-pages': { origins: ['https://github.com/*'] },
    'github-api': { origins: ['https://api.github.com/*'] },
});
export function permissionQuery(capability: BrowserCapability): PermissionQuery { return queries[capability]; }
export interface PermissionInspection {
    readonly phase: 'idle' | 'checking' | 'ready' | 'timed-out'; readonly pending: boolean;
    readonly grants: Readonly<Record<BrowserCapability, PermissionGrant>>;
}
export const UNKNOWN_PERMISSION_GRANTS: PermissionInspection['grants'] = deepFreeze({
    'local-storage': 'unknown', 'github-pages': 'unknown', 'github-api': 'unknown',
});
export const EMPTY_PERMISSION_INSPECTION: PermissionInspection = deepFreeze({ phase: 'idle', pending: false, grants: UNKNOWN_PERMISSION_GRANTS });
