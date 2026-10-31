/** Closed compatibility facts; catalog values never become public operands. */
export const BRANCH_SYNC_CATALOG_MAX_BYTES = 10 * 1024 * 1024;
export const BRANCH_SYNC_CATALOG_PROFILES = ['sdk-v1', 'legacy-evidence', 'native', 'ambiguous', 'unknown'] as const;
export const BRANCH_SYNC_CATALOG_PHASES = ['workspace-boundary', 'catalog-file-boundary', 'metadata-json',
    'metadata-conflict-markers', 'metadata-shape', 'profile-compatibility', 'evidence-shape',
    'evidence-path-boundary', 'catalog-contract', 'index-output'] as const;
export const SDK_CATALOG_PATH_FIELDS = ['specs', 'workflows', 'entrypoints', 'code', 'tests', 'documentation'] as const;
const OWNER_FIELDS = [...SDK_CATALOG_PATH_FIELDS, 'id', 'title', 'status', 'scope', 'owner', 'lastVerified', 'evidence', 'specification'] as const;
export const BRANCH_SYNC_CATALOG_FIELDS = ['catalog', 'version', 'capabilities', '$schema', ...OWNER_FIELDS] as const;
export type BranchSyncCatalogProfile = typeof BRANCH_SYNC_CATALOG_PROFILES[number];
export type BranchSyncCatalogPhase = typeof BRANCH_SYNC_CATALOG_PHASES[number];
export type BranchSyncCatalogField = typeof BRANCH_SYNC_CATALOG_FIELDS[number];
export interface BranchSyncCatalogDiagnostic {
    readonly phase: BranchSyncCatalogPhase;
    readonly profile: BranchSyncCatalogProfile;
    readonly field: BranchSyncCatalogField;
    /** Zero is document scope; positive positions identify one capability. */
    readonly capabilityNumber: number;
}

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const own = (value: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

export function isBranchSyncCatalogDiagnostic(value: unknown): value is BranchSyncCatalogDiagnostic {
    if (!record(value) || Object.keys(value).sort().join(',') !== 'capabilityNumber,field,phase,profile') return false;
    const { phase, profile, field, capabilityNumber } = value;
    return BRANCH_SYNC_CATALOG_PHASES.some(item => item === phase)
        && BRANCH_SYNC_CATALOG_PROFILES.some(item => item === profile)
        && BRANCH_SYNC_CATALOG_FIELDS.some(item => item === field)
        && typeof capabilityNumber === 'number' && Number.isSafeInteger(capabilityNumber)
        && capabilityNumber >= 0 && capabilityNumber <= BRANCH_SYNC_CATALOG_MAX_BYTES
        && (capabilityNumber !== 0 || !OWNER_FIELDS.some(item => item === field))
        && (capabilityNumber === 0 || !['catalog', 'version', '$schema'].includes(String(field)));
}

export function catalogDiagnostic(phase: BranchSyncCatalogPhase, profile: BranchSyncCatalogProfile = 'unknown',
    field: BranchSyncCatalogField = 'catalog', capabilityNumber = 0): BranchSyncCatalogDiagnostic {
    const value = { phase, profile, field, capabilityNumber };
    if (!isBranchSyncCatalogDiagnostic(value)) throw new TypeError('Invalid closed catalog compatibility diagnostic.');
    return Object.freeze(value);
}

export class BranchSyncCatalogFailure extends Error {
    readonly diagnostic: BranchSyncCatalogDiagnostic;
    constructor(diagnostic: BranchSyncCatalogDiagnostic) {
        super('Branch synchronization catalog compatibility requires review.');
        if (!isBranchSyncCatalogDiagnostic(diagnostic)) throw new TypeError('Invalid closed catalog compatibility diagnostic.');
        this.name = 'BranchSyncCatalogFailure';
        this.diagnostic = catalogDiagnostic(diagnostic.phase, diagnostic.profile, diagnostic.field, diagnostic.capabilityNumber);
        Object.freeze(this);
    }
}

function entryProfile(value: Record<string, unknown>, position: number): BranchSyncCatalogDiagnostic {
    if (own(value, 'specification')) {
        return catalogDiagnostic('profile-compatibility', own(value, 'specs') ? 'ambiguous' : 'native', 'specification', position);
    }
    if (!own(value, 'specs')) return catalogDiagnostic('metadata-shape', 'unknown', 'capabilities', position);
    if (own(value, 'evidence')) {
        const sdkFields = SDK_CATALOG_PATH_FIELDS.filter(field => own(value, field)).length;
        if (sdkFields > 1 && sdkFields < SDK_CATALOG_PATH_FIELDS.length) {
            return catalogDiagnostic('profile-compatibility', 'ambiguous', 'capabilities', position);
        }
        if (sdkFields === 1) {
            if (!Array.isArray(value.specs)) return catalogDiagnostic('evidence-shape', 'unknown', 'specs', position);
            if (!Array.isArray(value.evidence)) return catalogDiagnostic('evidence-shape', 'unknown', 'evidence', position);
            return catalogDiagnostic('profile-compatibility', 'legacy-evidence', 'workflows', position);
        }
    }
    return catalogDiagnostic('profile-compatibility', 'sdk-v1');
}

/** Classifies dialect/array shape only; the bundled validator still owns full SDK conformance. */
export function classifyBranchSyncCatalog(value: unknown): BranchSyncCatalogDiagnostic {
    if (!record(value)) return catalogDiagnostic('metadata-shape');
    const nativeSchema = own(value, '$schema');
    const nativeRoot = () => catalogDiagnostic('profile-compatibility', 'native', '$schema');
    const capabilities = value.capabilities;
    if (!Array.isArray(capabilities) || capabilities.length === 0 || capabilities.length > BRANCH_SYNC_CATALOG_MAX_BYTES) {
        return nativeSchema ? nativeRoot() : catalogDiagnostic('metadata-shape', 'unknown', 'capabilities');
    }
    let first: BranchSyncCatalogDiagnostic | undefined;
    for (const [index, capability] of capabilities.entries()) {
        if (!record(capability)) return nativeSchema ? nativeRoot() : catalogDiagnostic('metadata-shape', 'unknown', 'capabilities', index + 1);
        const next = entryProfile(capability, index + 1);
        if (next.profile === 'unknown') return nativeSchema ? nativeRoot() : next;
        if (next.profile === 'ambiguous') return next;
        if (first && first.profile !== next.profile) return catalogDiagnostic('profile-compatibility', 'ambiguous', 'capabilities', index + 1);
        first ??= next;
    }
    if (nativeSchema) return nativeRoot();
    if (first!.profile !== 'sdk-v1') return first!;
    if (value.version !== 1) return catalogDiagnostic('profile-compatibility', 'unknown', 'version');
    for (const [index, capability] of (capabilities as Record<string, unknown>[]).entries()) {
        for (const field of SDK_CATALOG_PATH_FIELDS) {
            if (!Array.isArray(capability[field])) return catalogDiagnostic('evidence-shape', 'sdk-v1', field, index + 1);
        }
    }
    return catalogDiagnostic('profile-compatibility', 'sdk-v1');
}
