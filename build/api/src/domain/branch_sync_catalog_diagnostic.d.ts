/** Closed compatibility facts; catalog values never become public operands. */
export declare const BRANCH_SYNC_CATALOG_MAX_BYTES: number;
export declare const BRANCH_SYNC_CATALOG_PROFILES: readonly ["sdk-v1", "legacy-evidence", "native", "ambiguous", "unknown"];
export declare const BRANCH_SYNC_CATALOG_PHASES: readonly ["workspace-boundary", "catalog-file-boundary", "metadata-json", "metadata-conflict-markers", "metadata-shape", "profile-compatibility", "evidence-shape", "evidence-path-boundary", "catalog-contract", "index-output"];
export declare const SDK_CATALOG_PATH_FIELDS: readonly ["specs", "workflows", "entrypoints", "code", "tests", "documentation"];
export declare const BRANCH_SYNC_CATALOG_FIELDS: readonly ["catalog", "version", "capabilities", "$schema", "specs", "workflows", "entrypoints", "code", "tests", "documentation", "id", "title", "status", "scope", "owner", "lastVerified", "evidence", "specification"];
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
export declare function isBranchSyncCatalogDiagnostic(value: unknown): value is BranchSyncCatalogDiagnostic;
export declare function catalogDiagnostic(phase: BranchSyncCatalogPhase, profile?: BranchSyncCatalogProfile, field?: BranchSyncCatalogField, capabilityNumber?: number): BranchSyncCatalogDiagnostic;
export declare class BranchSyncCatalogFailure extends Error {
    readonly diagnostic: BranchSyncCatalogDiagnostic;
    constructor(diagnostic: BranchSyncCatalogDiagnostic);
}
/** Classifies dialect/array shape only; the bundled validator still owns full SDK conformance. */
export declare function classifyBranchSyncCatalog(value: unknown): BranchSyncCatalogDiagnostic;
