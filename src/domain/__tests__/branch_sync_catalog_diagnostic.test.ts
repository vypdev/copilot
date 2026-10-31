import { BRANCH_SYNC_CATALOG_MAX_BYTES, BranchSyncCatalogFailure, catalogDiagnostic,
    classifyBranchSyncCatalog, isBranchSyncCatalogDiagnostic } from '../branch_sync_catalog_diagnostic';

const sdk = () => ({ specs: [], workflows: [], entrypoints: [], code: [], tests: [], documentation: [] });
const legacy = () => ({ specs: ['specs/owner.md'], evidence: ['src/'], status: 'Proposed', lastVerified: null });
const document = (...capabilities: unknown[]) => ({ version: 1, capabilities });

describe('closed branch-sync catalog compatibility facts', () => {
    it.each([
        ['null', null, 'unknown', 'metadata-shape', 'catalog', 0],
        ['array root', [], 'unknown', 'metadata-shape', 'catalog', 0],
        ['scalar root', 'PRIVATE', 'unknown', 'metadata-shape', 'catalog', 0],
        ['missing owners', {}, 'unknown', 'metadata-shape', 'capabilities', 0],
        ['empty owners', document(), 'unknown', 'metadata-shape', 'capabilities', 0],
        ['unbounded owner array', { capabilities: new Array(BRANCH_SYNC_CATALOG_MAX_BYTES + 1) }, 'unknown', 'metadata-shape', 'capabilities', 0],
        ['null owner', document(null), 'unknown', 'metadata-shape', 'capabilities', 1],
        ['owner without source', document({}), 'unknown', 'metadata-shape', 'capabilities', 1],
        ['legacy draft', document(legacy()), 'legacy-evidence', 'profile-compatibility', 'workflows', 1],
        ['legacy baseline', document({ ...legacy(), status: 'As-built baseline', lastVerified: '2026-10-01' }), 'legacy-evidence', 'profile-compatibility', 'workflows', 1],
        ['malformed legacy specs', document({ ...legacy(), specs: 'PRIVATE' }), 'unknown', 'evidence-shape', 'specs', 1],
        ['malformed combined evidence', document({ ...legacy(), evidence: {} }), 'unknown', 'evidence-shape', 'evidence', 1],
        ['partly expanded legacy', document({ ...legacy(), workflows: [] }), 'ambiguous', 'profile-compatibility', 'capabilities', 1],
        ['native owner', document({ specification: 'specs/owner.md' }), 'native', 'profile-compatibility', 'specification', 1],
        ['two source aliases', document({ ...sdk(), specification: 'PRIVATE' }), 'ambiguous', 'profile-compatibility', 'specification', 1],
        ['native root', { $schema: 'PRIVATE' }, 'native', 'profile-compatibility', '$schema', 0],
        ['native root with malformed owner', { $schema: 'PRIVATE', capabilities: [null] }, 'native', 'profile-compatibility', '$schema', 0],
        ['native root with unknown owner', { $schema: 'PRIVATE', capabilities: [{}] }, 'native', 'profile-compatibility', '$schema', 0],
        ['native root with SDK owners', { ...document(sdk()), $schema: 'PRIVATE' }, 'native', 'profile-compatibility', '$schema', 0],
        ['native root with ambiguous owner', { ...document({ ...sdk(), specification: 'PRIVATE' }), $schema: 'PRIVATE' }, 'ambiguous', 'profile-compatibility', 'specification', 1],
        ['legacy then SDK', document(legacy(), sdk()), 'ambiguous', 'profile-compatibility', 'capabilities', 2],
        ['SDK then legacy', document(sdk(), legacy()), 'ambiguous', 'profile-compatibility', 'capabilities', 2],
        ['repeated legacy owners', document(legacy(), legacy()), 'legacy-evidence', 'profile-compatibility', 'workflows', 1],
        ['repeated SDK owners', document(sdk(), sdk()), 'sdk-v1', 'profile-compatibility', 'catalog', 0],
        ['wrong SDK version', { ...document(sdk()), version: 2 }, 'unknown', 'profile-compatibility', 'version', 0],
        ['missing SDK evidence array', document({ specs: [] }), 'sdk-v1', 'evidence-shape', 'workflows', 1],
        ['malformed later SDK array', document(sdk(), { ...sdk(), tests: null }), 'sdk-v1', 'evidence-shape', 'tests', 2],
        ['opaque legacy extension on complete SDK', document({ ...sdk(), evidence: ['PRIVATE historical directory'] }), 'sdk-v1', 'profile-compatibility', 'catalog', 0],
    ])('classifies %s without exposing repository values', (_name, value, profile, phase, field, capabilityNumber) => {
        const diagnostic = classifyBranchSyncCatalog(value);
        expect(diagnostic).toEqual({ phase, profile, field, capabilityNumber });
        expect(isBranchSyncCatalogDiagnostic(diagnostic)).toBe(true);
        expect(Object.isFrozen(diagnostic)).toBe(true);
        expect(JSON.stringify(diagnostic)).not.toContain('PRIVATE');
    });

    const safe = { phase: 'profile-compatibility', profile: 'legacy-evidence', field: 'workflows', capabilityNumber: 1 };
    it.each([
        null, [], 'private', { ...safe, secret: 'PRIVATE' }, { ...safe, phase: 'PRIVATE' },
        { ...safe, profile: 'PRIVATE' }, { ...safe, field: 'PRIVATE' }, { ...safe, capabilityNumber: '1' },
        { ...safe, capabilityNumber: NaN }, { ...safe, capabilityNumber: 1.5 }, { ...safe, capabilityNumber: -1 },
        { ...safe, capabilityNumber: BRANCH_SYNC_CATALOG_MAX_BYTES + 1 }, { ...safe, capabilityNumber: 0 },
        { ...safe, field: 'catalog' }, { ...safe, field: 'version' }, { ...safe, field: '$schema' },
    ])('rejects untrusted recovery facts %#', value => {
        expect(isBranchSyncCatalogDiagnostic(value)).toBe(false);
        expect(() => new BranchSyncCatalogFailure(value as never)).toThrow(TypeError);
    });
    it('freezes a defensive copy and uses a static failure message', () => {
        const original = catalogDiagnostic('profile-compatibility', 'legacy-evidence', 'workflows', 1);
        const error = new BranchSyncCatalogFailure(original);
        expect(error.diagnostic).toEqual(original); expect(error.diagnostic).not.toBe(original);
        expect(error.name).toBe('BranchSyncCatalogFailure'); expect(Object.isFrozen(error)).toBe(true);
        expect(isBranchSyncCatalogDiagnostic(catalogDiagnostic('workspace-boundary'))).toBe(true);
        expect(isBranchSyncCatalogDiagnostic(catalogDiagnostic('metadata-shape', 'unknown', 'capabilities'))).toBe(true);
        expect(isBranchSyncCatalogDiagnostic(catalogDiagnostic('metadata-shape', 'unknown', 'capabilities', BRANCH_SYNC_CATALOG_MAX_BYTES))).toBe(true);
        expect(() => catalogDiagnostic('PRIVATE' as never)).toThrow(TypeError);
    });
});
