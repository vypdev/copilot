import type { BrowserApi } from './api.ts';
import { packageIdentity, packageObservation, type PackageIdentity } from '../../domain/package_identity.ts';

/** Parameterless native metadata read, independent of settings, sessions, provider access and update APIs. */
export function readPackageIdentity(api: Pick<BrowserApi, 'runtime'>, source: unknown): PackageIdentity {
    try {
        const native = api.runtime;
        if (typeof native?.getManifest !== 'function') return packageIdentity({ state: 'unsupported' }, source);
        return packageIdentity(packageObservation(native.getManifest()), source);
    } catch { return packageIdentity({ state: 'unavailable' }, source); }
}
