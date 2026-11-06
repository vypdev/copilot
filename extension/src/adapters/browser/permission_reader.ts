import type { BrowserApi } from './api.ts';
import { permissionQuery, type BrowserCapability, type PermissionGrant } from '../../domain/permission_inspection.ts';

/** Fixed native queries; caller input never supplies an origin or a browser permission. */
export class BrowserPermissionReader {
    constructor(private readonly api: Pick<BrowserApi, 'permissions'>) {}
    async query(capability: BrowserCapability): Promise<PermissionGrant> {
        try {
            const native = this.api.permissions;
            if (typeof native?.contains !== 'function') return 'unsupported';
            const query = permissionQuery(capability);
            const value = await native.contains({ ...(query.permissions ? { permissions: [...query.permissions] } : {}),
                ...(query.origins ? { origins: [...query.origins] } : {}) });
            return value === true ? 'granted' : value === false ? 'not-granted' : 'unknown';
        } catch { return 'unknown'; }
    }
    observe(changed: () => void): () => void {
        const releases: (() => void)[] = [];
        for (const name of ['onAdded', 'onRemoved'] as const) {
            try {
                const event = this.api.permissions?.[name];
                if (typeof event?.addListener !== 'function' || typeof event.removeListener !== 'function') continue;
                event.addListener(changed);
                releases.push(() => { try { event.removeListener(changed); } catch { /* Closed native context. */ } });
            } catch { /* Manual and foreground refresh remain available without native events. */ }
        }
        return () => { for (const release of releases) release(); };
    }
}
