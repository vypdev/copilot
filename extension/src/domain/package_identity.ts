import { deepFreeze } from './value.ts';

export type PackageObservation = { readonly state: 'known'; readonly name: string; readonly version: string; readonly manifestVersion: 3 }
    | { readonly state: 'unsupported' | 'unavailable' };
export interface PackageIdentity { readonly observation: PackageObservation; readonly sourceTree: string | null }
/** Package facts describe this native page only, never the Action or a background authorization. */
export function packageIdentity(observation: PackageObservation, source: unknown): PackageIdentity {
    return deepFreeze({ observation, sourceTree: typeof source === 'string' && /^[a-f0-9]{64}$(?![\s\S])/u.test(source) ? source : null });
}
export const UNKNOWN_PACKAGE_IDENTITY = packageIdentity({ state: 'unavailable' }, null);
/** Read only required scalar fields; native manifests may have browser-specific prototypes and extra keys. */
export function packageObservation(value: unknown): PackageObservation {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return { state: 'unavailable' };
    const manifest = value as Record<string, unknown>;
    const name = manifest.name; const version = manifest.version; const major = manifest.manifest_version;
    if (typeof name !== 'string' || name.length < 1 || name.length > 128 || name.trim() !== name || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(name)
        || typeof version !== 'string' || !/^(?:0|[1-9][0-9]{0,4})(?:\.(?:0|[1-9][0-9]{0,4})){0,3}$(?![\s\S])/u.test(version)
        || version.split('.').some(part => Number(part) > 65535) || major !== 3) return { state: 'unavailable' };
    return deepFreeze({ state: 'known', name, version, manifestVersion: 3 });
}
